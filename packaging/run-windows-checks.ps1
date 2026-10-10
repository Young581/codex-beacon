# Hosted Windows runners are elevated and default new files to Administrators
# ownership. Run fixtures with the current user's SID as the default owner,
# matching a normal desktop session without weakening production ACL checks.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;

public static class CodexBeaconRunnerOwner {
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SetTokenInformation(IntPtr token, int infoClass, IntPtr information, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    public static void UseCurrentUser() {
        var sid = WindowsIdentity.GetCurrent().User;
        var bytes = new byte[sid.BinaryLength];
        sid.GetBinaryForm(bytes, 0);
        IntPtr sidMemory = Marshal.AllocHGlobal(bytes.Length);
        IntPtr ownerMemory = Marshal.AllocHGlobal(IntPtr.Size);
        IntPtr token = IntPtr.Zero;
        try {
            Marshal.Copy(bytes, 0, sidMemory, bytes.Length);
            Marshal.WriteIntPtr(ownerMemory, sidMemory);
            // TOKEN_QUERY | TOKEN_ADJUST_DEFAULT; TokenOwner = 4.
            if (!OpenProcessToken(Process.GetCurrentProcess().Handle, 0x0088, out token))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if (!SetTokenInformation(token, 4, ownerMemory, (uint)IntPtr.Size))
                throw new Win32Exception(Marshal.GetLastWin32Error());
        } finally {
            if (token != IntPtr.Zero) CloseHandle(token);
            Marshal.FreeHGlobal(ownerMemory);
            Marshal.FreeHGlobal(sidMemory);
        }
    }
}
'@
[CodexBeaconRunnerOwner]::UseCurrentUser()
$tests = Get-ChildItem (Join-Path $PSScriptRoot '../tests') -Filter '*.js' | Where-Object { $_.Name -ne 'tls-runtime-smoke.js' } | ForEach-Object { $_.FullName }
node --test --experimental-test-isolation=none $tests
exit $LASTEXITCODE
