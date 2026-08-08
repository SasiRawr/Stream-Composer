; Installer hooks for the NSIS (.exe) installer — see
; bundle.windows.nsis.installerHooks in tauri.conf.json.
;
; v1.1.0's install gave no indication when it was overwriting an existing
; install (flagged in testing as important — a silent overwrite reads as
; risky even when it's safe). This adds one MessageBox, shown only when an
; existing install is actually found, before any files are touched.
!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\stream-composer.exe" hook_preinstall_upgrade hook_preinstall_fresh
  hook_preinstall_upgrade:
    MessageBox MB_OK|MB_ICONINFORMATION "An existing installation of Stream Composer Suite was found in this folder.$\r$\n$\r$\nThis will upgrade it to the new version. Your projects and any files you've saved elsewhere are not stored in the install folder and will not be affected."
  hook_preinstall_fresh:
!macroend
