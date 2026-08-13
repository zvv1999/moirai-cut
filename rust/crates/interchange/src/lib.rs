//! Loss-aware timeline interchange for every Moirai Cut shell.
//!
//! Adapters consume the persisted project document instead of a UI-specific
//! model. Every export is revision-bound and returns a structured report so a
//! caller never has to confuse "valid XML" with "lossless handoff".

mod fcpxml;
mod model;
mod report;

pub use fcpxml::{FcpxmlExportOptions, FcpxmlVersion, export_fcpxml};
pub use report::{
    AdapterReport, ErrorCode, ExportSource, InterchangeError, InterchangeExport, InterchangeIssue,
    InterchangeReport, InterchangeTarget, IssueSeverity, RelinkAsset, RelinkReport,
};
