# Moirai Cut Desktop

The native desktop app, built with [GPUI](https://gpui.rs).

## Getting started

**1. Install Rust:**

```bash
# Linux / macOS / WSL
./script/setup-rust
```

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .\script\setup-rust.ps1
```

Both scripts skip installation if Rust is already present. On Linux/macOS/WSL only: after a fresh install, reload your shell with `source "$HOME/.cargo/env"`

**2. Install native dependencies:**

```bash
# Linux / macOS / WSL
./apps/desktop/script/setup
```

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .\apps\desktop\script\setup.ps1
```

**3. Run:**

```bash
cargo run -p moirai-cut-desktop
```

## Platform notes

**Linux:** supports apt (Debian/Ubuntu/Mint), dnf (Fedora/RHEL), and pacman (Arch).

**macOS:** requires the full Xcode application, not only Command Line Tools,
because GPUI compiles Metal shaders during the Rust build. Launch Xcode once
after installation, then select it with
`sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` if
`xcrun --find metal` cannot locate the compiler.

**Windows:** the setup script checks for Visual Studio Build Tools. If missing, it prints the install link.

**WSL:** runs the same scripts as Linux. Window rendering works via WSLg on Windows 11 and Windows 10 22H2+. If you're on an older build, test on the host instead.
