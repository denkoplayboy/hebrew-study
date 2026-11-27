#Requires AutoHotkey v2.0
#SingleInstance Force
CoordMode "Pixel", "Screen"
CoordMode "Mouse", "Screen"
SetMouseDelay -1
SetDefaultMouseSpeed 0
ProcessSetPriority "High"

; Точность Sleep до ~1 мс (по умолчанию ~15.6 мс), иначе тайминги 200–350 мс будут «прыгать».
DllCall("winmm\timeBeginPeriod", "UInt", 1)
OnExit((*) => DllCall("winmm\timeEndPeriod", "UInt", 1))

; ================= НАСТРОЙКИ =================
ScanX1 := 1320          ; область поиска
ScanY1 := 540
ScanX2 := 1440
ScanY2 := 640

; Цвета, на которые НУЖНО нажимать
TargetColors := [0x006944, 0x0D4988, 0x8A0EC5]   ; зелёный, синий, фиолетовый
TargetVariation := 35                             ; допуск по каждому каналу (0–255)

; Цвета, при появлении которых НЕЛЬЗЯ нажимать 2.5–3 сек
StopColors := [0xFFD800, 0xFFFFFF]                ; жёлтый, белый
StopVariation := 40
StopPauseMin := 2500
StopPauseMax := 3000

; ----- как отличить появившийся объект от фона -----
SampleStep := 3          ; проверяем каждый 3-й пиксель по X и Y
MinBlobShare := 0.02     ; цвет должен занимать хотя бы 2% области...
MaxBlobShare := 0.60     ; ...но не больше 60% — иначе это фон
EdgeBgShare := 0.50      ; если цвет занимает больше 50% краёв области — это фон
ConfirmFrames := 2       ; цвет должен держаться 2 проверки подряд (защита от мерцания)

; Частота проверок — случайная в этих пределах, мс
CheckMin := 35
CheckMax := 65

; [x, y, разброс]
ClickA := [1380, 1080, 50]
ClickB := [1370, 1270, 50]

DelayMin := 500          ; задержка перед ClickB после ClickA, мс
DelayMax := 1000
IdleMin := 3600          ; если ничего не было 3.6–4.4 сек — кликаем ClickB
IdleMax := 4400

; ----- одно действие: движение + пауза + нажатие + отпускание -----
ActionMin := 200         ; всё действие целиком, мс
ActionMax := 350
HoldMin := 40            ; сколько кнопка зажата, мс
HoldMax := 80
PreClickMin := 15        ; пауза между остановкой курсора и нажатием, мс
PreClickMax := 40

MaxRunMs := 20 * 60 * 1000   ; 20 минут

LogFile := A_ScriptDir "\clicker.log"   ; "" — не писать журнал

; ================= СОСТОЯНИЕ =================
global running := false
global state := "idle"
global lastActionTick := 0
global clickBDueTick := 0
global idleTimeout := 4000
global blockUntil := 0
global stopSeen := false
global armed := true
global hitFrames := 0
global missFrames := 0

; Разбираем цвета на каналы один раз
global AllColors := [], AllVar := [], CR := [], CG := [], CB := []
for c in TargetColors
    AllColors.Push(c), AllVar.Push(TargetVariation)
for c in StopColors
    AllColors.Push(c), AllVar.Push(StopVariation)
for c in AllColors
    CR.Push((c >> 16) & 0xFF), CG.Push((c >> 8) & 0xFF), CB.Push(c & 0xFF)
global NT := TargetColors.Length

; ================= ХОТКЕЙ =================
$F1::ToggleBot()   ; запуск на 20 минут / остановка

; ================= УПРАВЛЕНИЕ =================
ToggleBot() {
    global
    if running {
        StopBot("Остановлено (F1)")
        return
    }
    running := true
    state := "idle"
    armed := true
    hitFrames := 0
    missFrames := 0
    stopSeen := false
    blockUntil := 0
    lastActionTick := A_TickCount
    idleTimeout := Random(IdleMin, IdleMax)
    SetTimer(AutoStop, -MaxRunMs)
    Schedule()
    ShowTip("Запущено на 20 минут. F1 — остановить", 1500)
    Log("START")
}

AutoStop() {
    StopBot("Прошло 20 минут — остановлено. F1 — запустить снова")
}

StopBot(msg) {
    global running
    running := false
    SetTimer(Tick, 0)
    SetTimer(AutoStop, 0)
    ShowTip(msg, 3000)
    Log("STOP: " msg)
}

Schedule() {
    global running, CheckMin, CheckMax
    if running
        SetTimer(Tick, -Random(CheckMin, CheckMax))
}

; ================= ОСНОВНОЙ ЦИКЛ =================
Tick() {
    global
    if !running
        return
    now := A_TickCount
    a := Analyze()

    ; Жёлтый/белый: при появлении — пауза 2.5–3 сек, пока виден — тоже не жмём
    if a.stop {
        if !stopSeen {
            blockUntil := now + Random(StopPauseMin, StopPauseMax)
            state := "idle"              ; отменяем запланированный ClickB
            Log("PAUSE " (blockUntil - now) " мс")
        }
        stopSeen := true
    } else
        stopSeen := false

    if a.target
        hitFrames++, missFrames := 0
    else
        missFrames++, hitFrames := 0
    if missFrames >= ConfirmFrames
        armed := true                    ; объект пропал — готовы к следующему

    if a.stop || now < blockUntil {
        lastActionTick := now            ; отсчёт простоя начнётся после паузы
        Schedule()
        return
    }

    if state = "waiting" {
        if now >= clickBDueTick {
            DoClick(ClickB, "B после A")
            state := "idle"
            lastActionTick := A_TickCount
            idleTimeout := Random(IdleMin, IdleMax)
        }
    } else if armed && hitFrames >= ConfirmFrames {
        DoClick(ClickA, "A")
        armed := false
        state := "waiting"
        clickBDueTick := A_TickCount + Random(DelayMin, DelayMax)
        lastActionTick := A_TickCount
    } else if now - lastActionTick >= idleTimeout {
        DoClick(ClickB, "B простой")
        lastActionTick := A_TickCount
        idleTimeout := Random(IdleMin, IdleMax)
    }
    Schedule()
}

; ================= РАСПОЗНАВАНИЕ =================
; Снимаем область одним BitBlt и считаем, сколько точек каждого цвета внутри и на краях.
; Цвет считается «появившимся объектом», если он занимает заметную, но не большую часть
; области и не заполняет её края — так фон того же цвета не вызывает нажатия.
Analyze() {
    global
    w := ScanX2 - ScanX1 + 1, h := ScanY2 - ScanY1 + 1
    pix := Capture(ScanX1, ScanY1, w, h)
    n := AllColors.Length
    cnt := [], bcnt := []
    Loop n
        cnt.Push(0), bcnt.Push(0)
    samples := 0, border := 0

    y := 0
    while y < h {
        rowOff := y * w * 4
        borderRow := (y < SampleStep) || (y + SampleStep >= h)
        x := 0
        while x < w {
            px := NumGet(pix, rowOff + x * 4, "UInt")
            r := (px >> 16) & 0xFF, g := (px >> 8) & 0xFF, b := px & 0xFF
            isB := borderRow || x < SampleStep || x + SampleStep >= w
            samples++
            if isB
                border++
            Loop n {
                v := AllVar[A_Index]
                if Abs(r - CR[A_Index]) <= v && Abs(g - CG[A_Index]) <= v && Abs(b - CB[A_Index]) <= v {
                    cnt[A_Index]++
                    if isB
                        bcnt[A_Index]++
                    break
                }
            }
            x += SampleStep
        }
        y += SampleStep
    }

    target := false, stop := false
    Loop n {
        share := cnt[A_Index] / samples
        bshare := border ? bcnt[A_Index] / border : 0
        ok := share >= MinBlobShare && share <= MaxBlobShare && bshare < EdgeBgShare
        if A_Index <= NT
            target := target || ok
        else
            stop := stop || ok
    }
    return {target: target, stop: stop}
}

Capture(x, y, w, h) {
    hdcScreen := DllCall("GetDC", "Ptr", 0, "Ptr")
    hdcMem := DllCall("CreateCompatibleDC", "Ptr", hdcScreen, "Ptr")
    hbm := DllCall("CreateCompatibleBitmap", "Ptr", hdcScreen, "Int", w, "Int", h, "Ptr")
    obm := DllCall("SelectObject", "Ptr", hdcMem, "Ptr", hbm, "Ptr")
    DllCall("BitBlt", "Ptr", hdcMem, "Int", 0, "Int", 0, "Int", w, "Int", h
        , "Ptr", hdcScreen, "Int", x, "Int", y, "UInt", 0x00CC0020)
    DllCall("SelectObject", "Ptr", hdcMem, "Ptr", obm, "Ptr")

    bi := Buffer(40, 0)
    NumPut("UInt", 40, bi, 0)
    NumPut("Int", w, bi, 4)
    NumPut("Int", -h, bi, 8)          ; строки сверху вниз
    NumPut("UShort", 1, bi, 12)
    NumPut("UShort", 32, bi, 14)
    pix := Buffer(w * h * 4, 0)
    DllCall("GetDIBits", "Ptr", hdcMem, "Ptr", hbm, "UInt", 0, "UInt", h, "Ptr", pix, "Ptr", bi, "UInt", 0)

    DllCall("DeleteObject", "Ptr", hbm)
    DllCall("DeleteDC", "Ptr", hdcMem)
    DllCall("ReleaseDC", "Ptr", 0, "Ptr", hdcScreen)
    return pix
}

; ================= ДВИЖЕНИЕ И КЛИК =================
; Всё действие (движение → пауза → нажатие → отпускание) укладывается в ActionMin–ActionMax мс.
DoClick(p, label) {
    global
    t0 := NowMs()
    total := Random(ActionMin, ActionMax)
    hold := Random(HoldMin, HoldMax)
    pre := Random(PreClickMin, PreClickMax)
    moveDur := total - hold - pre

    tx := p[1] + Spread(p[3])
    ty := p[2] + Spread(p[3])
    if !SmoothMove(tx, ty, moveDur, t0)
        return
    WaitUntil(t0 + moveDur + pre)
    Click("Down")
    WaitUntil(t0 + total)
    Click("Up")
    Log(label " " Round(NowMs() - t0) " мс (план " total ") → " tx "," ty)
}

; Разброс гуще к центру зоны, но не дальше r
Spread(r) => Round((Random(-r, r) + Random(-r, r)) / 2)

; Кривая Безье со случайным изгибом, разгон/торможение, лёгкое дрожание,
; случайный шаг. Привязка ко времени, а не к числу шагов, — длительность точная.
SmoothMove(tx, ty, dur, t0) {
    global running
    MouseGetPos(&sx, &sy)
    dx := tx - sx, dy := ty - sy
    dist := Sqrt(dx * dx + dy * dy)
    if dist < 3 {
        WaitUntil(t0 + dur)
        MouseMove(tx, ty, 0)
        return running
    }
    off := dist * Random(-0.25, 0.25)       ; насколько дуга отклоняется от прямой
    along := Random(0.3, 0.7)                ; где вершина дуги
    cx := sx + dx * along - dy / dist * off
    cy := sy + dy * along + dx / dist * off
    skew := Random(0.8, 1.25)                ; асимметрия разгона и торможения

    Loop {
        el := NowMs() - t0
        if el >= dur
            break
        if !running
            return false
        t := (el / dur) ** skew
        e := t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
        u := 1 - e
        x := u * u * sx + 2 * u * e * cx + e * e * tx
        y := u * u * sy + 2 * u * e * cy + e * e * ty
        j := e < 0.85 ? 1 : 0                  ; дрожание только до подхода к цели
        MouseMove(Round(x) + Random(-j, j), Round(y) + Random(-j, j), 0)
        Sleep(Random(4, 9))
    }
    MouseMove(tx, ty, 0)
    return true
}

; ================= ВСПОМОГАТЕЛЬНОЕ =================
NowMs() {
    static freq := 0
    if !freq {
        DllCall("QueryPerformanceFrequency", "Int64*", &f := 0)
        freq := f
    }
    DllCall("QueryPerformanceCounter", "Int64*", &c := 0)
    return c * 1000 / freq
}

WaitUntil(t) {
    while (left := t - NowMs()) > 0
        Sleep(left > 3 ? 1 : 0)
}

ShowTip(msg, ms) {
    ToolTip(msg)
    SetTimer(HideTip, -ms)
}

HideTip() => ToolTip()

Log(msg) {
    global LogFile
    if LogFile != ""
        FileAppend(FormatTime(, "yyyy-MM-dd HH:mm:ss") " " msg "`n", LogFile, "UTF-8")
}
