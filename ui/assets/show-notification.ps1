param([switch]$CheckOnly, [string]$CheckSoundFile, [int]$CheckVolume = -1)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
$notifierSource = @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class CodexNotifierAudio {
    private const string Alias = "codex_beacon_sound";
    [DllImport("winmm.dll", CharSet = CharSet.Unicode, EntryPoint = "mciSendStringW")]
    private static extern uint Send(string command, IntPtr result, uint length, IntPtr callback);
    [DllImport("winmm.dll", CharSet = CharSet.Unicode, EntryPoint = "mciSendStringW")]
    private static extern uint Read(string command, StringBuilder result, uint length, IntPtr callback);
    public static void Close() { Send("close " + Alias, IntPtr.Zero, 0, IntPtr.Zero); }
    private static void Command(string command) {
        if (Send(command, IntPtr.Zero, 0, IntPtr.Zero) != 0) throw new Exception("Windows could not decode or play the audio file");
    }
    private static void Open(string file, bool adjustable = false) {
        if (String.IsNullOrEmpty(file) || file.Length > 2048 || !Path.IsPathRooted(file) ||
            file.StartsWith("\\\\") || file.StartsWith("//") || file.IndexOf('"') >= 0)
            throw new Exception("Choose a local WAV or MP3 file");
        foreach (char character in file) if (Char.IsControl(character)) throw new Exception("Invalid audio path");
        string extension = Path.GetExtension(file).ToLowerInvariant();
        if (extension != ".wav" && extension != ".mp3") throw new Exception("Choose a WAV or MP3 file");
        if (!File.Exists(file)) throw new Exception("Audio file does not exist");
        // The MPEG device supports per-playback volume for both WAV and MP3.
        // The waveaudio device does not implement setaudio volume.
        Command("open \"" + file + "\" type " + (extension == ".wav" && !adjustable ? "waveaudio" : "mpegvideo") + " alias " + Alias);
    }
    public static void Check(string file) {
        Close();
        try { Open(file); } finally { Close(); }
    }
    private static void SetVolume(int volume) {
        if (volume < 0 || volume > 100) throw new Exception("Invalid sound volume");
        Command("setaudio " + Alias + " volume to " + (volume * 10));
    }
    private static string SystemSoundFile() {
        object configured = Microsoft.Win32.Registry.GetValue(
            @"HKEY_CURRENT_USER\AppEvents\Schemes\Apps\.Default\SystemExclamation\.Current", "", null);
        // An empty registered value is the user's No Sounds choice.
        if (configured is string) return Environment.ExpandEnvironmentVariables((string)configured);
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Media", "Windows Notify System Generic.wav");
    }
    public static int CheckVolume(string file, int volume) {
        Close();
        try {
            Open(String.IsNullOrEmpty(file) ? SystemSoundFile() : file, true);
            SetVolume(volume);
            var value = new StringBuilder(64);
            if (Read("status " + Alias + " volume", value, 64, IntPtr.Zero) != 0) throw new Exception("Could not read playback volume");
            return Int32.Parse(value.ToString());
        } finally { Close(); }
    }
    private static void PlayFile(string file, int volume) {
        Open(file, true);
        SetVolume(volume);
        Command("play " + Alias + " from 0");
    }
    public static bool Play(string file, int volume) {
        Close();
        if (volume < 0 || volume > 100) throw new Exception("Invalid sound volume");
        if (volume == 0) return true;
        if (!String.IsNullOrEmpty(file)) {
            try { PlayFile(file, volume); return true; }
            catch { Close(); }
        }
        // Resolve the user's Windows sound scheme and play at the same volume,
        // including custom-file fallback. Never adjust device/master volume.
        string systemSound = SystemSoundFile();
        if (!String.IsNullOrEmpty(systemSound)) {
            try { PlayFile(systemSound, volume); }
            catch {
                Close();
                // Preserve the original default at full volume on systems
                // without the media device. Reduced volume never bypasses it.
                if (volume == 100) System.Media.SystemSounds.Exclamation.Play();
                else throw;
            }
        }
        return String.IsNullOrEmpty(file);
    }
}

public static class CodexNotifierHost {
    // WinForms' ShowBalloonTip does not expose NIIF_NOSOUND. This small
    // notification-area wrapper uses that documented flag so sound is opt-in.
    private sealed class NativeIcon : NativeWindow, IDisposable {
        private const uint AddIcon = 0;
        private const uint ModifyIcon = 1;
        private const uint DeleteIcon = 2;
        private const uint SetVersion = 4;
        private const uint CallbackMessage = 0x8001;
        private const uint Version4 = 4;
        private const uint InfoIcon = 0x01;
        private const uint NoSystemSound = 0x10;
        private const uint BalloonHide = 0x0403;
        private const uint BalloonTimeout = 0x0404;
        private const uint BalloonClick = 0x0405;
        private const uint IconSelect = 0x0400;
        private const uint IconKeySelect = 0x0401;
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct IconData {
            public uint cbSize;
            public IntPtr hWnd;
            public uint uID;
            public uint uFlags;
            public uint uCallbackMessage;
            public IntPtr hIcon;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
            public uint dwState;
            public uint dwStateMask;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
            public uint uTimeoutOrVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
            public uint dwInfoFlags;
            public Guid guidItem;
            public IntPtr hBalloonIcon;
        }
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "Shell_NotifyIconW")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ShellNotifyIcon(uint message, ref IconData data);
        private sealed class Notice {
            public IconData Data;
            public string Id;
        }
        private uint visibleId;
        private readonly Dictionary<uint, Notice> notices = new Dictionary<uint, Notice>();
        private uint nextIconId = 0;
        public NativeIcon() {
            CreateHandle(new CreateParams());
        }
        private uint NextIconId() {
            // Version 4 callbacks carry the icon ID in a 16-bit field.
            nextIconId = nextIconId == 65535 ? 1 : nextIconId + 1;
            return nextIconId;
        }
        private void Remove(uint iconId) {
            Notice notice;
            if (!notices.TryGetValue(iconId, out notice)) return;
            if (visibleId == iconId) visibleId = 0;
            // Clear the map first: deletion can cause another callback.
            notices.Remove(iconId);
            var old = notice.Data;
            ShellNotifyIcon(DeleteIcon, ref old);
        }
        public void Show(string id, string title, string body, string appName) {
            var data = new IconData();
            data.cbSize = (uint)Marshal.SizeOf(typeof(IconData));
            data.hWnd = Handle;
            // A fresh native identity prevents a late click on an older
            // balloon from being incorrectly attributed to a newer batch.
            data.uID = NextIconId();
            data.uFlags = 1 | 2 | 4;
            data.uCallbackMessage = CallbackMessage;
            data.hIcon = SystemIcons.Information.Handle;
            data.szTip = String.IsNullOrEmpty(appName) ? "Codex" : appName.Substring(0, Math.Min(127, appName.Length));
            data.szInfo = "";
            data.szInfoTitle = "";
            if (!ShellNotifyIcon(AddIcon, ref data)) throw new Exception("Windows could not create the notification icon");
            try {
                data.uTimeoutOrVersion = Version4;
                if (!ShellNotifyIcon(SetVersion, ref data)) throw new Exception("Windows could not configure notification callbacks");
                data.uFlags = 0x10;
                data.szInfoTitle = title.Length > 63 ? title.Substring(0, 63) : title;
                data.szInfo = body.Length > 255 ? body.Substring(0, 255) : body;
                // Always suppress the Shell's sound. Explicit sound is played
                // separately only when this request's sound value is true.
                data.dwInfoFlags = InfoIcon | NoSystemSound;
                notices[data.uID] = new Notice { Data = data, Id = id };
                if (!ShellNotifyIcon(ModifyIcon, ref data)) throw new Exception("Windows rejected the notification");
            } catch {
                notices.Remove(data.uID);
                ShellNotifyIcon(DeleteIcon, ref data);
                throw;
            }
            // Keep one tray icon. A sound-only request never reaches this
            // method and cannot change the identity of a visible balloon.
            // A synchronous Shell dismissal may already have removed this
            // notice; in that case keep any previously visible notification.
            if (notices.ContainsKey(data.uID)) {
                if (visibleId != 0) Remove(visibleId);
                visibleId = data.uID;
            }
        }
        protected override void WndProc(ref Message message) {
            if (message.Msg == CallbackMessage) {
                uint callback = unchecked((uint)message.LParam.ToInt64());
                uint code = callback & 0xffff;
                uint iconId = (callback >> 16) & 0xffff;
                Notice notice;
                if (notices.TryGetValue(iconId, out notice)) {
                    if (code == BalloonClick || code == IconSelect || code == IconKeySelect) {
                        // Clear before emitting so duplicate Shell callbacks
                        // cannot navigate twice. Clicking never plays a sound.
                        Remove(iconId);
                        Console.WriteLine("CLICK " + notice.Id);
                        Console.Out.Flush();
                    } else if (code == BalloonHide || code == BalloonTimeout) {
                        Remove(iconId);
                    }
                }
            }
            base.WndProc(ref message);
        }
        public void Dispose() {
            foreach (uint iconId in new List<uint>(notices.Keys)) Remove(iconId);
            DestroyHandle();
        }
    }
    public static void Run() {
        var pending = new ConcurrentQueue<string>();
        var reader = new Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line.Length <= 65536 && pending.Count < 32) pending.Enqueue(line);
            }
            pending.Enqueue("__END__");
        });
        reader.IsBackground = true;
        reader.Start();
        var context = new ApplicationContext();
        var icon = new NativeIcon();
        var timer = new System.Windows.Forms.Timer();
        timer.Interval = 100;
        timer.Tick += (sender, args) => {
            string line;
            if (!pending.TryDequeue(out line)) return;
            if (line == "__END__") { context.ExitThread(); return; }
            string id = "unknown";
            try {
                var serializer = new JavaScriptSerializer();
                var data = serializer.Deserialize<Dictionary<string, object>>(line);
                var requestId = Convert.ToString(data["id"]);
                var title = Convert.ToString(data["title"]);
                var body = Convert.ToString(data["body"]);
                if (String.IsNullOrEmpty(requestId) || requestId.Length > 128) throw new Exception("Invalid notification ID");
                foreach (char character in requestId) {
                    if (Char.IsControl(character) || Char.IsWhiteSpace(character)) throw new Exception("Invalid notification ID");
                }
                id = requestId;
                int volume = 100;
                if (data.ContainsKey("soundVolume")) {
                    if (!(data["soundVolume"] is int)) throw new Exception("Invalid sound volume");
                    volume = (int)data["soundVolume"];
                    if (volume < 0 || volume > 100) throw new Exception("Invalid sound volume");
                }
                if (!data.ContainsKey("desktop") || !(data["desktop"] is bool) || (bool)data["desktop"]) {
                    icon.Show(id, title, body, data.ContainsKey("appName") ? Convert.ToString(data["appName"]) : "Codex");
                }
                if (data.ContainsKey("sound") && data["sound"] is bool && (bool)data["sound"]) {
                    string file = data.ContainsKey("soundFile") ? Convert.ToString(data["soundFile"]) : "";
                    if (!CodexNotifierAudio.Play(file, volume)) Console.WriteLine("SOUND_FALLBACK " + id);
                }
                Console.WriteLine("SHOWN " + id);
                Console.Out.Flush();
            } catch (Exception ex) {
                Console.WriteLine("ERROR " + id + " " + ex.Message.Replace("\r", " ").Replace("\n", " "));
                Console.Out.Flush();
            }
        };
        timer.Start();
        try { Application.Run(context); }
        finally { timer.Dispose(); icon.Dispose(); context.Dispose(); CodexNotifierAudio.Close(); }
    }
}
'@
Add-Type -TypeDefinition $notifierSource -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
if ($CheckOnly) { Write-Output 'Notification helper compiled successfully'; exit 0 }
if ($CheckVolume -ge 0) { Write-Output ('Audio playback volume: ' + [CodexNotifierAudio]::CheckVolume($CheckSoundFile, $CheckVolume)); exit 0 }
if ($CheckSoundFile) { [CodexNotifierAudio]::Check($CheckSoundFile); Write-Output 'Audio file decoded successfully'; exit 0 }
[CodexNotifierHost]::Run()
