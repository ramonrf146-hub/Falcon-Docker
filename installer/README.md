# Falcon Stack Installer

Interactive PowerShell wizard that installs the Falcon IoT stack on a fresh Windows 11 PC, from zero to working ChirpStack + Node-RED + Docker, with the LPS8 LoRa gateway and Waveshare Modbus gateway tested end-to-end.

## What it does (15 steps)

| # | Step | Action |
|---|------|--------|
| 1 | Pre-flight checks | OS, internet, virtualization, disk, admin |
| 2 | Enable WSL + VirtualMachinePlatform | + reboot if needed |
| 3 | Install Docker Desktop | Silent install + first-launch handshake |
| 4 | Install Git for Windows | via winget |
| 5 | Configure network adapter | Primary `192.168.1.10/24` + alias `172.31.255.253/30` |
| 6 | Add firewall rule | UDP/1700 inbound |
| 7 | Clone `Falcon-Docker` from GitHub | private repo, GCM-stored PAT |
| 8 | Download Docker image | from GitHub Releases (~226 MB) |
| 9 | Load image | `docker load` |
| 10 | Configure `.env` | per-site values prompted one by one |
| 11 | Configure `devices.csv` | LoRa sensors prompted one by one |
| 12 | Start the stack | `docker compose up -d --no-build` + wait for bootstrap |
| 13 | LPS8 LoRa gateway | Auto-restore master config + verify uplinks reach ChirpStack |
| 14 | Modbus Waveshare gateway | Guide user through config + verify port 502 |
| 15 | Done | Open UIs, summary |

Each step is verified before moving on. Failures stop the wizard with a clear error and a log path.

## How to run

### Download + run (recommended — one PowerShell session)

Open **PowerShell** as a regular user. Paste these commands (replace `YOUR_PAT` with your GitHub Personal Access Token):

```powershell
$pat = 'YOUR_PAT'   # e.g. ghp_xxxxxxxxxxxxx
Invoke-WebRequest `
  -Uri 'https://raw.githubusercontent.com/ramonrf146-hub/Falcon-Docker/main/installer/setup.ps1' `
  -Headers @{ Authorization = "Bearer $pat" } `
  -OutFile $HOME\Downloads\setup.ps1
cd $HOME\Downloads
Set-ExecutionPolicy -Scope Process Bypass -Force
.\setup.ps1
```

The wizard takes over from here. (`Invoke-WebRequest` preserves the file bytes exactly — no encoding issues.)

### Alternative: download via browser

If you'd rather download from the GitHub web UI:

1. Open https://github.com/ramonrf146-hub/Falcon-Docker/blob/main/installer/setup.ps1
2. Click the **Raw** button.
3. Right click on the page → **Save As** → save to your Downloads folder as `setup.ps1`.
4. Run as above (`cd $HOME\Downloads`, `Set-ExecutionPolicy ...`, `.\setup.ps1`).

The script is ASCII-only and starts with a UTF-8 BOM, so any browser encoding works.

### Flags

```powershell
.\setup.ps1                  # standard run
.\setup.ps1 -AIAssist        # AI-assisted error diagnosis (asks for Anthropic API key once)
.\setup.ps1 -Resume 0        # resume from last incomplete step (auto-set after a reboot)
.\setup.ps1 -Resume 3        # skip ahead: mark steps 1..2 as done and start at step 3
.\setup.ps1 -Force           # discard saved state and start over
```

## Resume after reboot

When step 2 enables WSL features it triggers a reboot. The installer:

1. Saves its state to `%LOCALAPPDATA%\falcon-installer\state.json`.
2. Creates a Startup shortcut that re-runs `setup.ps1 -Resume`.
3. Reboots.
4. After login, Windows auto-launches the shortcut.
5. The wizard resumes from step 3.

The shortcut is removed automatically when the wizard reaches step 15.

## AI assist (`-AIAssist`)

Default behavior: **no AI calls**. The installer is fully deterministic.

When you pass `-AIAssist`:

- Nothing happens unless a step fails.
- On failure, the wizard asks "Ask the AI for help? [y/N]". Default is no.
- If you agree, it calls Anthropic Claude API with the failing step name and error message.
- API key is asked once, stored in Windows Credential Manager (this PC only).
- AI returns 2-3 sentences of diagnosis + suggested commands.

You can revoke the API key at any time:

```powershell
cmdkey /delete:FalconInstaller_AnthropicKey
```

## What you need to have ready

Before you run the wizard:

- A fresh Windows 11 PC with internet (any connection — WiFi during setup is fine).
- USB-Ethernet dongle or built-in Ethernet port for the internal network.
- A switch for the internal LAN (or a direct cable if only LPS8 + Modbus are used).
- The Dragino LPS8v2 + antenna + power supply.
- The Waveshare 4-CH RS485 to POE ETH (B) gateway + power supply.
- The LoRa sensors with their stickers visible (DevEUI + AppKey).
- Your **GitHub PAT** for `ramonrf146-hub` (the wizard pastes it once and Git Credential Manager keeps it).
- (Optional, for `-AIAssist`) Anthropic API key.

The image (`falcon-docker-*.tar.gz`) is downloaded automatically from GitHub Releases — no USB needed.

## Per-site values the wizard asks for

| Field | Source |
|-------|--------|
| Timezone | e.g. `America/Mexico_City` |
| LPS8 Gateway EUI | LPS8 sticker (16 hex chars) |
| Azure IoT Device ID, Hub Hostname, SAS Key, Area ID | Optional — skip and edit later |
| Dragino rain sensor EUI, Azure Maps key | Optional |
| Site latitude/longitude | Optional |
| Per-sensor: DevEUI, Name, AppKey, DeviceProfile | Loop prompts until you press Enter on empty DevEUI |

## Troubleshooting

**"Docker still not responding" after step 3**
Open Docker Desktop manually from the Start Menu, wait until the whale icon says "Engine running", then re-run the wizard.

**"LPS8 not responding at 172.31.255.254"**
- Cable in the LPS8 **WAN** port (not LAN)?
- LPS8 powered on for at least 60 seconds?
- PC NIC has alias `172.31.255.253/30`? (`ipconfig | findstr 172.31`)

**"Waveshare not reachable on 192.168.1.100:502"**
- Did you submit the web UI form?
- Confirm Protocol is **Modbus TCP to RTU**.
- Confirm Device Port = `502` (default is `4196`).

**Stuck on "Auto-resume" after reboot**
Manually run the script:
```powershell
.\setup.ps1 -Resume
```

**Reset everything and start over**
```powershell
.\setup.ps1 -Force
```

## Files this installer creates

| Path | Purpose |
|------|---------|
| `%LOCALAPPDATA%\falcon-installer\state.json` | Step progress (resume) |
| `%LOCALAPPDATA%\falcon-installer\setup.log` | Detailed log |
| Startup folder shortcut | Auto-resume after reboot (removed at the end) |
| `C:\Projects\Falcon-Docker\` | The cloned repo |
| `C:\Projects\Falcon-Docker\dist\` | Downloaded Docker image tarball |

## License / scope

Internal — Heromatic / Environmental Monitoring (Task-1667).
