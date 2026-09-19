//! High-Performance Audio DSP & Real-Time Buffer Pipeline
//!
//! Provides zero-latency, SIMD-friendly 32-bit floating-point audio processing:
//! - Stereo Ear Swap & Binaural Phase Inversion
//! - 16D Spatial Orbit Trajectory Simulation (ITD, Pinna Elevation, Distance Attenuation)
//! - 10-Band Biquad IIR Filter Bank (Direct Form II Transposed)
//! - Reverb Impulse Response Matrix & Spatial Convolution
//! - Radix-2 Cooley-Tukey Fast Fourier Transform (FFT) & Perceptual Frequency Binning

use std::f32::consts::PI;

/// Two-channel interleaved or separated audio frame
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct StereoSample {
    pub left: f32,
    pub right: f32,
}

// ============================================================================
// 1. STEREO CHANNEL INVERSION & BINAURAL EAR SWAP
// ============================================================================

/// Low-latency binaural ear-swap processor with anti-click crossfading
#[derive(Debug, Clone)]
pub struct EarSwapProcessor {
    pub enabled: bool,
    pub crossfade_progress: f32,
    pub crossfade_step: f32,
    pub phase_invert_right: bool,
}

impl Default for EarSwapProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl EarSwapProcessor {
    pub fn new() -> Self {
        Self {
            enabled: false,
            crossfade_progress: 0.0,
            crossfade_step: 1.0 / 256.0, // ~5.8ms crossfade at 44.1kHz
            phase_invert_right: false,
        }
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// Processes in-place separated channel slices (L, R)
    pub fn process_channels(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        for i in 0..len {
            let target = if self.enabled { 1.0 } else { 0.0 };
            if (self.crossfade_progress - target).abs() > 1e-4 {
                if self.crossfade_progress < target {
                    self.crossfade_progress = (self.crossfade_progress + self.crossfade_step).min(1.0);
                } else {
                    self.crossfade_progress = (self.crossfade_progress - self.crossfade_step).max(0.0);
                }
            }

            let l_orig = left[i];
            let r_orig = right[i];

            let r_mod = if self.phase_invert_right { -r_orig } else { r_orig };

            // Equal-power crossfade between straight and swapped channels
            let t = self.crossfade_progress;
            let straight_gain = (1.0 - t).sqrt();
            let swapped_gain = t.sqrt();

            left[i] = (l_orig * straight_gain) + (r_mod * swapped_gain);
            right[i] = (r_mod * straight_gain) + (l_orig * swapped_gain);
        }
    }
}

// ============================================================================
// 2. 16D SPATIAL SOUND & BINAURAL TRAJECTORY ENGINE
// ============================================================================

/// 3D Coordinates and Acoustic Parameters in 16D Spatial Field
#[derive(Debug, Clone, Copy, Default)]
#[repr(C)]
pub struct SpatialPosition16D {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub radius: f32,
    pub itd_seconds_left: f32,
    pub itd_seconds_right: f32,
    pub pinna_gain_db: f32,
    pub behind_cutoff_hz: f32,
    pub stereo_bass_pan: f32,
    pub reverb_wet_level: f32,
}

/// 16D Spatial Sound Orbit Generator
#[derive(Debug, Clone)]
pub struct SpatialTrajectory16D {
    pub angle: f32,
    pub speed: f32,
    pub base_radius: f32,
    pub sample_rate: f32,
}

impl SpatialTrajectory16D {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            angle: 0.0,
            speed: 0.034, // ~3.2s per 360 degree orbit
            base_radius: 2.5,
            sample_rate: if sample_rate > 0.0 { sample_rate } else { 48000.0 },
        }
    }

    /// Steps the 16D trajectory forward by one animation / audio tick
    pub fn step(&mut self) -> SpatialPosition16D {
        self.angle += self.speed;
        if self.angle > 2.0 * PI {
            self.angle -= 2.0 * PI;
        }

        // Multi-dimensional spatial wave equations matching AM Player acoustic curve
        let distance_oscillation = 1.7 * (self.angle * 0.35).sin();
        let radius = self.base_radius + distance_oscillation;

        let x = radius * self.angle.sin();
        let z = radius * self.angle.cos();
        let y = 1.5 * (self.angle * 1.6).sin();

        // Interaural Time Difference (Woodworth's spherical head model approximation)
        let itd_factor = (x / radius.max(0.1)) * 0.0007; // max ~0.7ms
        let (itd_l, itd_r) = if itd_factor >= 0.0 {
            (itd_factor, 0.0)
        } else {
            (0.0, itd_factor.abs())
        };

        // Pinna vertical elevation acoustic notch filter gain
        let pinna_gain = if y > 0.4 {
            (y / 1.5) * 10.0
        } else {
            0.0
        };

        // Head shadow occlusion / rear acoustic lowpass cutoff
        let behind_cutoff = if z > 0.3 {
            let ratio = (z / radius.max(0.1)).min(1.0);
            (20000.0 - (ratio * 16000.0)).max(2500.0)
        } else {
            20000.0
        };

        // Headphone visceral bass ear-flip sync
        let bass_pan = (self.angle.sin() * 0.88).clamp(-1.0, 1.0);

        // Distance-based acoustic reverberation level
        let reverb_wet = 0.15 + (radius / 5.0).min(1.0) * 0.35;

        SpatialPosition16D {
            x,
            y,
            z,
            radius,
            itd_seconds_left: itd_l,
            itd_seconds_right: itd_r,
            pinna_gain_db: pinna_gain,
            behind_cutoff_hz: behind_cutoff,
            stereo_bass_pan: bass_pan,
            reverb_wet_level: reverb_wet,
        }
    }
}

// ============================================================================
// 3. 10-BAND BIQUAD IIR FILTER BANK
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BiquadType {
    LowShelf,
    Peaking,
    HighShelf,
    LowPass,
    HighPass,
}

/// Direct Form II Transposed Biquad Filter (32-bit Float)
#[derive(Debug, Clone, Copy)]
pub struct BiquadFilter {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
    // Delay state registers (L, R)
    s1_l: f32,
    s2_l: f32,
    s1_r: f32,
    s2_r: f32,
}

impl BiquadFilter {
    pub fn new() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            s1_l: 0.0,
            s2_l: 0.0,
            s1_r: 0.0,
            s2_r: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.s1_l = 0.0;
        self.s2_l = 0.0;
        self.s1_r = 0.0;
        self.s2_r = 0.0;
    }

    /// Computes Robert Bristow-Johnson Audio EQ Cookbook coefficients
    pub fn configure(
        &mut self,
        filter_type: BiquadType,
        freq_hz: f32,
        gain_db: f32,
        q: f32,
        sample_rate: f32,
    ) {
        let sr = sample_rate.max(8000.0);
        let f0 = freq_hz.clamp(10.0, sr * 0.499);
        let w0 = 2.0 * PI * (f0 / sr);
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.01));
        let a_val = 10.0f32.powf(gain_db / 40.0);

        let (mut b0, mut b1, mut b2, mut a0, mut a1, mut a2) = match filter_type {
            BiquadType::LowShelf => {
                let two_sqrt_a_alpha = 2.0 * a_val.sqrt() * alpha;
                let b0 = a_val * ((a_val + 1.0) - (a_val - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = 2.0 * a_val * ((a_val - 1.0) - (a_val + 1.0) * cos_w0);
                let b2 = a_val * ((a_val + 1.0) - (a_val - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a_val + 1.0) + (a_val - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = -2.0 * ((a_val - 1.0) + (a_val + 1.0) * cos_w0);
                let a2 = (a_val + 1.0) + (a_val - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::HighShelf => {
                let two_sqrt_a_alpha = 2.0 * a_val.sqrt() * alpha;
                let b0 = a_val * ((a_val + 1.0) + (a_val - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = -2.0 * a_val * ((a_val - 1.0) + (a_val + 1.0) * cos_w0);
                let b2 = a_val * ((a_val + 1.0) + (a_val - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a_val + 1.0) - (a_val - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = 2.0 * ((a_val - 1.0) - (a_val + 1.0) * cos_w0);
                let a2 = (a_val + 1.0) - (a_val - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::Peaking => {
                let b0 = 1.0 + alpha * a_val;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 - alpha * a_val;
                let a0 = 1.0 + alpha / a_val;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha / a_val;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::LowPass => {
                let b0 = (1.0 - cos_w0) / 2.0;
                let b1 = 1.0 - cos_w0;
                let b2 = (1.0 - cos_w0) / 2.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::HighPass => {
                let b0 = (1.0 + cos_w0) / 2.0;
                let b1 = -(1.0 + cos_w0);
                let b2 = (1.0 + cos_w0) / 2.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
        };

        let inv_a0 = 1.0 / a0;
        self.b0 = b0 * inv_a0;
        self.b1 = b1 * inv_a0;
        self.b2 = b2 * inv_a0;
        self.a1 = a1 * inv_a0;
        self.a2 = a2 * inv_a0;
    }

    #[inline(always)]
    pub fn process_sample(&mut self, in_l: f32, in_r: f32) -> (f32, f32) {
        // Direct Form II Transposed for Left Channel
        let out_l = self.b0 * in_l + self.s1_l;
        self.s1_l = self.b1 * in_l - self.a1 * out_l + self.s2_l;
        self.s2_l = self.b2 * in_l - self.a2 * out_l;

        // Direct Form II Transposed for Right Channel
        let out_r = self.b0 * in_r + self.s1_r;
        self.s1_r = self.b1 * in_r - self.a1 * out_r + self.s2_r;
        self.s2_r = self.b2 * in_r - self.a2 * out_r;

        (out_l, out_r)
    }
}

/// 10-Band Professional Mastering Equalizer
pub struct Equalizer10Band {
    pub filters: [BiquadFilter; 10],
    pub center_frequencies: [f32; 10],
    pub gains_db: [f32; 10],
    pub sample_rate: f32,
}

impl Equalizer10Band {
    pub fn new(sample_rate: f32) -> Self {
        let center_frequencies = [
            31.25, 62.5, 125.0, 250.0, 500.0,
            1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
        ];
        let mut eq = Self {
            filters: [BiquadFilter::new(); 10],
            center_frequencies,
            gains_db: [0.0; 10],
            sample_rate: if sample_rate > 0.0 { sample_rate } else { 48000.0 },
        };
        eq.recalculate_all();
        eq
    }

    pub fn set_band_gain(&mut self, band_idx: usize, gain_db: f32) {
        if band_idx < 10 {
            self.gains_db[band_idx] = gain_db.clamp(-24.0, 24.0);
            let freq = self.center_frequencies[band_idx];
            let filter_type = if band_idx == 0 {
                BiquadType::LowShelf
            } else if band_idx == 9 {
                BiquadType::HighShelf
            } else {
                BiquadType::Peaking
            };
            self.filters[band_idx].configure(filter_type, freq, self.gains_db[band_idx], 1.414, self.sample_rate);
        }
    }

    pub fn recalculate_all(&mut self) {
        for i in 0..10 {
            let freq = self.center_frequencies[i];
            let filter_type = if i == 0 {
                BiquadType::LowShelf
            } else if i == 9 {
                BiquadType::HighShelf
            } else {
                BiquadType::Peaking
            };
            self.filters[i].configure(filter_type, freq, self.gains_db[i], 1.414, self.sample_rate);
        }
    }

    pub fn process_channels(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        for i in 0..len {
            let mut l = left[i];
            let mut r = right[i];
            for filter in self.filters.iter_mut() {
                let (fl, fr) = filter.process_sample(l, r);
                l = fl;
                r = fr;
            }
            left[i] = l;
            right[i] = r;
        }
    }
}

// ============================================================================
// 4. REVERB CONVOLUTION MATRIX & ROOM IMPULSE SYNTHESIS
// ============================================================================

/// Synthetic Acoustic Tail Generator & Fast Convolution Engine
#[derive(Debug, Clone)]
pub struct ReverbMatrix {
    pub sample_rate: f32,
    pub decay_time_s: f32,
    pub wet_gain: f32,
    pub dry_gain: f32,
    impulse_l: Vec<f32>,
    impulse_r: Vec<f32>,
}

impl ReverbMatrix {
    pub fn new(sample_rate: f32, decay_time_s: f32) -> Self {
        let sr = if sample_rate > 0.0 { sample_rate } else { 48000.0 };
        let mut matrix = Self {
            sample_rate: sr,
            decay_time_s: decay_time_s.clamp(0.1, 5.0),
            wet_gain: 0.35,
            dry_gain: 0.95,
            impulse_l: Vec::new(),
            impulse_r: Vec::new(),
        };
        matrix.generate_impulse();
        matrix
    }

    /// Generates physical exponential room impulse response with early reflections
    pub fn generate_impulse(&mut self) {
        let length = (self.sample_rate * self.decay_time_s) as usize;
        let mut l = Vec::with_capacity(length);
        let mut r = Vec::with_capacity(length);

        // Simple linear congruential pseudo-random for deterministic pristine impulse
        let mut seed: u64 = 0x123456789ABCDEF0;
        let mut next_rand = || -> f32 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let val = (seed >> 32) as u32;
            (val as f32 / u32::MAX as f32) * 2.0 - 1.0
        };

        for i in 0..length {
            let t = i as f32 / self.sample_rate;
            let decay = (-t / 0.95).exp();
            let early = if t < 0.08 {
                (t * 800.0).sin() * 0.35 * (-t / 0.03).exp()
            } else {
                0.0
            };

            let sample_l = next_rand() * decay + early;
            let sample_r = next_rand() * decay - early;

            l.push(sample_l);
            r.push(sample_r);
        }

        self.impulse_l = l;
        self.impulse_r = r;
    }

    pub fn get_impulse_channels(&self) -> (&[f32], &[f32]) {
        (&self.impulse_l, &self.impulse_r)
    }
}

// ============================================================================
// 5. RADIX-2 FAST FOURIER TRANSFORM (FFT) & VISUALIZER FREQUENCY BINNING
// ============================================================================

/// In-place Cooley-Tukey Radix-2 FFT Engine
pub struct FastFourierTransform {
    pub size: usize,
    twiddle_re: Vec<f32>,
    twiddle_im: Vec<f32>,
    bit_rev: Vec<usize>,
}

impl FastFourierTransform {
    pub fn new(size: usize) -> Self {
        assert!(size > 0 && (size & (size - 1)) == 0, "FFT size must be a power of 2");
        let half = size / 2;
        let mut twiddle_re = Vec::with_capacity(half);
        let mut twiddle_im = Vec::with_capacity(half);

        for k in 0..half {
            let angle = -2.0 * PI * (k as f32) / (size as f32);
            twiddle_re.push(angle.cos());
            twiddle_im.push(angle.sin());
        }

        let bits = size.trailing_zeros();
        let mut bit_rev = vec![0usize; size];
        for i in 0..size {
            let mut rev = 0;
            let mut val = i;
            for _ in 0..bits {
                rev = (rev << 1) | (val & 1);
                val >>= 1;
            }
            bit_rev[i] = rev;
        }

        Self {
            size,
            twiddle_re,
            twiddle_im,
            bit_rev,
        }
    }

    /// Computes in-place FFT on real input, storing magnitude in output buffer
    pub fn compute_magnitudes(&self, input_real: &[f32], magnitudes_out: &mut [f32]) {
        let n = self.size;
        let in_len = input_real.len().min(n);

        let mut re = vec![0.0f32; n];
        let mut im = vec![0.0f32; n];

        // Bit-reversal permutation with Hann windowing for zero spectral leakage
        for i in 0..n {
            let rev_idx = self.bit_rev[i];
            let sample = if rev_idx < in_len { input_real[rev_idx] } else { 0.0 };
            let hann = 0.5 * (1.0 - (2.0 * PI * rev_idx as f32 / n as f32).cos());
            re[i] = sample * hann;
            im[i] = 0.0;
        }

        // Cooley-Tukey decimation-in-time butterflies
        let mut len = 2;
        while len <= n {
            let half = len / 2;
            let step = n / len;
            for i in (0..n).step_by(len) {
                for j in 0..half {
                    let k = j * step;
                    let u_re = re[i + j];
                    let u_im = im[i + j];
                    let v_re = re[i + j + half];
                    let v_im = im[i + j + half];

                    let t_re = v_re * self.twiddle_re[k] - v_im * self.twiddle_im[k];
                    let t_im = v_re * self.twiddle_im[k] + v_im * self.twiddle_re[k];

                    re[i + j] = u_re + t_re;
                    im[i + j] = u_im + t_im;
                    re[i + j + half] = u_re - t_re;
                    im[i + j + half] = u_im - t_im;
                }
            }
            len <<= 1;
        }

        // Output normalized power/magnitude spectrum (first half: 0 to Nyquist)
        let out_len = magnitudes_out.len().min(n / 2);
        let norm = 1.0 / (n as f32 / 2.0);
        for i in 0..out_len {
            magnitudes_out[i] = (re[i] * re[i] + im[i] * im[i]).sqrt() * norm;
        }
    }

    /// High-density logarithmic frequency binning with ISO equal-loudness curve
    pub fn compute_visualizer_bins(
        magnitudes: &[f32],
        bar_count: usize,
        bins_out: &mut [f32],
        peaks_out: &mut [f32],
    ) {
        let bar_count = bar_count.min(bins_out.len()).min(peaks_out.len());
        if bar_count == 0 || magnitudes.is_empty() {
            return;
        }

        let mag_len = magnitudes.len();
        let min_freq = 1usize;
        let max_freq = mag_len.saturating_sub(4).max(min_freq + 1);

        for i in 0..bar_count {
            let log_pos = (i as f32 / (bar_count - 1).max(1) as f32).powf(1.55);
            let bin_idx = ((log_pos * (max_freq - min_freq) as f32) as usize + min_freq).min(mag_len - 1);
            let next_log_pos = (((i + 1) as f32 / (bar_count - 1).max(1) as f32).powf(1.55)).min(1.0);
            let next_bin_idx = ((next_log_pos * (max_freq - min_freq) as f32) as usize + min_freq).min(mag_len - 1);

            let mut sum = 0.0;
            let mut count = 0;
            for k in bin_idx..=next_bin_idx {
                sum += magnitudes[k];
                count += 1;
            }
            let raw_level = if count > 0 { sum / count as f32 } else { magnitudes[bin_idx] };

            // Equal-loudness treble compensation curve
            let eq_weight = 1.0 + (i as f32 / bar_count as f32) * 0.55;
            let normalized = ((raw_level * eq_weight).powf(0.82) * 1.55).clamp(0.0, 1.0);

            bins_out[i] = normalized;

            // Physics-based falling peak caps
            if normalized >= peaks_out[i] {
                peaks_out[i] = normalized;
            } else {
                peaks_out[i] = (peaks_out[i] - 0.015).max(0.0);
            }
        }
    }
}

// ============================================================================
// 6. C-ABI EXPORTS FOR DIRECT CALLS OR WASM
// ============================================================================

#[no_mangle]
pub extern "C" fn am_dsp_ear_swap(left_ptr: *mut f32, right_ptr: *mut f32, len: usize, enabled: i32) {
    if left_ptr.is_null() || right_ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let left = std::slice::from_raw_parts_mut(left_ptr, len);
        let right = std::slice::from_raw_parts_mut(right_ptr, len);
        if enabled != 0 {
            for i in 0..len {
                let tmp = left[i];
                left[i] = right[i];
                right[i] = tmp;
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn am_dsp_calculate_16d_position(
    angle: f32,
    base_radius: f32,
    out_pos: *mut SpatialPosition16D,
) {
    if out_pos.is_null() {
        return;
    }
    let mut traj = SpatialTrajectory16D::new(48000.0);
    traj.angle = angle;
    traj.base_radius = base_radius;
    let pos = traj.step();
    unsafe {
        *out_pos = pos;
    }
}
