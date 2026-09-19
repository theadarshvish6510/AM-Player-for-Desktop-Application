//! Adarsh's Media Player (AM Player) - Native Rust Engine Core
//!
//! Subsystems:
//! - `dsp`: High-Performance 32-bit Floating-Point Audio DSP & Buffer Pipeline
//! - `metadata`: Ultra-Fast Zero-Copy Binary Media & Cover Art Parser (< 1ms)
//! - `vlc_bridge`: Hardware Acceleration & LibVLC Direct3D11/DXVA2/Vulkan Bridge

pub mod dsp;
pub mod metadata;
pub mod vlc_bridge;

pub use dsp::{
    BiquadFilter, BiquadType, EarSwapProcessor, Equalizer10Band, FastFourierTransform,
    ReverbMatrix, SpatialPosition16D, SpatialTrajectory16D, StereoSample,
};
pub use metadata::{extract_metadata, ContainerFormat, MediaMetadata};
pub use vlc_bridge::{HwAccelBackend, VlcBridgeController, VlcHwStatus};

/// Engine build information
#[no_mangle]
pub extern "C" fn am_engine_version() -> *const u8 {
    b"AM-Player-Rust-Engine-2.1.0\0".as_ptr()
}
