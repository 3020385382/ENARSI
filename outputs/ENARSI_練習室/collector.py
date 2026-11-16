"""Foreground Windows clipboard collector. Saves sanitized note data only."""
from pathlib import Path
import ctypes,json,time,os,sys
from ctypes import wintypes
from bgw_parser import extract,merge

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'我的收集'
def atomic_json(path,data):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,path)
def main():
    if os.name!='nt':raise SystemExit('這個自動收集器供 Windows 使用；手機與其他電腦請用練習室的貼上功能。')
    bank=json.loads((ROOT/'data.js').read_text(encoding='utf-8').removeprefix('window.BANK = ').rstrip().removesuffix(';'))
    OUT.mkdir(exist_ok=True);dest=OUT/'BGW_新增中文筆記.enarsi.json'
    data=json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else dict(format='enarsi-notes',version=1,notes={})
    user32=ctypes.WinDLL('user32',use_last_error=True);kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    user32.GetClipboardData.argtypes=[wintypes.UINT];user32.GetClipboardData.restype=wintypes.HANDLE
    kernel.GlobalLock.argtypes=[wintypes.HGLOBAL];kernel.GlobalLock.restype=wintypes.LPVOID
    kernel.GlobalUnlock.argtypes=[wintypes.HGLOBAL]
    kernel.GlobalSize.argtypes=[wintypes.HGLOBAL];kernel.GlobalSize.restype=ctypes.c_size_t
    html_format=user32.RegisterClipboardFormatW('HTML Format')
    def clipboard(fmt):
        if not user32.IsClipboardFormatAvailable(fmt):return ''
        handle=user32.GetClipboardData(fmt)
        if not handle:return ''
        size=kernel.GlobalSize(handle)
        if size>6_000_000:return ''
        ptr=kernel.GlobalLock(handle)
        if not ptr:return ''
        try:return ctypes.wstring_at(ptr) if fmt==13 else ctypes.string_at(ptr,size).decode('utf-8',errors='replace')
        finally:kernel.GlobalUnlock(handle)
    print('BGW 複製收集器 — 視窗開著時才會收集\n')
    print('1. 在 BGW 開啟題目。\n2. 按 Ctrl+U 開啟原始碼，再 Ctrl+A、Ctrl+C。\n3. 看本視窗顯示「已收集」。完成後把筆記包匯入練習室。\n')
    print('只整理你主動複製的題目，不會連線 BGW；按 Ctrl+C 停止。')
    print('儲存位置：'+str(dest)+'\n',flush=True)
    last=user32.GetClipboardSequenceNumber();last_content=''
    while True:
        seq=user32.GetClipboardSequenceNumber()
        if seq!=last:
            if not user32.OpenClipboard(None):time.sleep(.25);continue
            try:
                plain=clipboard(13);rich=clipboard(html_format)
            finally:user32.CloseClipboard()
            last=seq
            source=plain if 'question-text' in plain and '<' in plain else rich
            if source and source!=last_content and 'question-text' in source:
                last_content=source
                try:
                    n=extract(source,bank['questions']);merge(data['notes'],n);atomic_json(dest,data)
                    bits=['中文題幹' if n['stemZh'] else '','原文筆記' if n['html'] else '','配對規則' if n.get('drag') else '']
                    print(time.strftime('%H:%M:%S')+' 已收集 '+n['id']+' — '+'、'.join(x for x in bits if x)+f"（累計 {len(data['notes'])} 題）",flush=True)
                except Exception as e:print('未儲存：'+str(e),flush=True)
        time.sleep(.6)
if __name__=='__main__':
    try:main()
    except KeyboardInterrupt:print('\n已停止收集；筆記包已保留。')
    except Exception as e:print('無法啟動：'+str(e));input('按 Enter 關閉。')
