import { useRef, useState } from "react";
import { Download, Upload, LogOut, Volume2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp, speak, hasVoice } from "../lib/app";
import { Switch } from "../components/ui";
import { AISection } from "../components/AISection";
import { DesignPickers } from "../components/DesignPickers";
import { apiHref, isNative, setDailyReminder } from "../lib/native";

export default function SettingsPage() {
  const { me, settings, updateSettings, toast, refreshMe, touch } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("theme") || "auto";
    } catch {
      return "auto";
    }
  });

  const set = (p: Partial<typeof settings>) => updateSettings(p).catch((e) => toast(e.message, true));

  const applyTheme = (t: string) => {
    setTheme(t);
    try {
      if (t === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      /* noop */
    }
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };

  const doImport = async (f: File) => {
    if (!confirm("Восстановить из копии? Текущие данные будут заменены (на сервере сохранится запасная копия базы).")) return;
    try {
      const data = JSON.parse(await f.text());
      await api.post("/api/import", data);
      toast("Данные восстановлены");
      touch();
      refreshMe();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
        </div>
      </div>

      <div className="card col gap-16">
        <Row title="Новых слов в день" hint="Сколько новых слов «сажать» в поливе ежедневно.">
          <select className="select" style={{ width: 90 }} value={settings.newPerDay} onChange={(e) => set({ newPerDay: Number(e.target.value) })}>
            {[3, 5, 8, 10, 15, 20, 30].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Row>
        <Row title="Длина тренировки" hint="Сколько упражнений в одном раунде.">
          <select className="select" style={{ width: 90 }} value={settings.sessionSize} onChange={(e) => set({ sessionSize: Number(e.target.value) })}>
            {[10, 15, 20, 30, 40].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Row>
        <Row title="Целевая память" hint="С какой вероятностью ты хочешь помнить слово в момент повторения. Выше — чаще повторения.">
          <select className="select" style={{ width: 90 }} value={settings.retention} onChange={(e) => set({ retention: Number(e.target.value) })}>
            {[0.8, 0.85, 0.9, 0.93, 0.95].map((n) => (
              <option key={n} value={n}>
                {Math.round(n * 100)}%
              </option>
            ))}
          </select>
        </Row>
        <Row title="Ставка уверенности" hint="Перед проверкой ответа выбираешь: наугад / думаю / уверен. Это влияет на интервал и учит чувствовать своё знание.">
          <Switch on={settings.confidenceBets} onChange={(v) => set({ confidenceBets: v })} />
        </Row>
        <Row title="Огласовки (никуд)" hint="Показывать слова с огласовками там, где это не подсказка.">
          <Switch on={settings.showNikud} onChange={(v) => set({ showNikud: v })} />
        </Row>
        <Row title="Ивритская раскладка" hint="В полях для иврита латинские и русские буквы автоматически превращаются в ивритские по израильской раскладке.">
          <Switch on={settings.keyboardMap} onChange={(v) => set({ keyboardMap: v })} />
        </Row>
        <Row title="Скорость озвучки" hint={hasVoice("he") ? "Голос иврита найден на этом устройстве." : "На этом устройстве не найден голос иврита — установи его в системных настройках речи."}>
          <div className="row">
            <select className="select" style={{ width: 90 }} value={settings.ttsRate} onChange={(e) => set({ ttsRate: Number(e.target.value) })}>
              {[0.6, 0.75, 0.9, 1, 1.15].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
            <button className="btn soft icon" onClick={() => speak("שָׁלוֹם, מָה שְׁלוֹמְךָ?", "he", settings.ttsRate)}>
              <Volume2 size={17} />
            </button>
          </div>
        </Row>
        <Row title="Тема" hint="Светлая, тёмная или как в системе.">
          <div className="pill-tabs">
            {[
              ["auto", "авто"],
              ["light", "светлая"],
              ["dark", "тёмная"],
            ].map(([id, l]) => (
              <button key={id} className={theme === id ? "on" : ""} onClick={() => applyTheme(id)}>
                {l}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <div className="section-title">Оформление</div>
      <div className="card">
        <DesignPickers />
        <p className="tiny muted mt-16">Новые шрифты, цвета и породы деревьев открывает Дизайн-студия на Ротшильде — на игровом поле в Лавке.</p>
      </div>

      <div className="section-title">ИИ</div>
      {me?.ai.enabled ? (
        <AISection />
      ) : (
        <div className="card col gap-6">
          <p>ИИ не подключён. Приложение работает, но слова придётся заполнять вручную, а проверка фраз станет самопроверкой.</p>
          <p className="small text-2">
            Чтобы подключить: в fly.io выполни <code>fly secrets set ANTHROPIC_API_KEY=…</code> (ключ берётся на console.anthropic.com).
          </p>
        </div>
      )}

      {isNative && <ReminderCard />}

      <div className="section-title">Данные</div>
      <div className="card col gap-16">
        <p className="small text-2">Всё хранится в базе SQLite на томе fly.io. Время от времени скачивай резервную копию — это один JSON-файл.</p>
        <div className="row wrap">
          <a className="btn" href={apiHref("/api/export")} download>
            <Download size={16} /> Скачать копию
          </a>
          <button className="btn" onClick={() => file.current?.click()}>
            <Upload size={16} /> Восстановить из копии
          </button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </div>
        <div className="row wrap">
          <a className="btn soft" href={apiHref("/api/export/words?format=csv")}>
            Словарь в CSV
          </a>
          <a className="btn soft" href={apiHref("/api/export/words?format=tsv")}>
            Словарь в TSV для Anki
          </a>
        </div>
      </div>

      {me?.needsPassword && (
        <>
          <div className="section-title">Вход</div>
          <button
            className="btn"
            onClick={async () => {
              await api.post("/api/logout");
              refreshMe();
            }}
          >
            <LogOut size={16} /> Выйти на этом устройстве
          </button>
        </>
      )}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="row between gap-16">
      <div className="grow">
        <div>{title}</div>
        <div className="small muted">{hint}</div>
      </div>
      {children}
    </div>
  );
}

/** Одно спокойное напоминание в день — только в приложении. Без серий и наград за вход. */
function ReminderCard() {
  const { toast } = useApp();
  const [hour, setHour] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem("remindHour");
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  });
  const apply = async (h: number | null) => {
    const err = await setDailyReminder(h);
    if (err) return toast(err, true);
    setHour(h);
    try {
      if (h === null) localStorage.removeItem("remindHour");
      else localStorage.setItem("remindHour", String(h));
    } catch {
      /* без памяти */
    }
    toast(h === null ? "Напоминание выключено" : `Напомню в ${h}:00`);
  };
  return (
    <>
      <div className="section-title">Напоминание</div>
      <div className="card col gap-6">
        <div className="row between">
          <span>Напомнить о поливе раз в день</span>
          <Switch on={hour !== null} onChange={(v) => void apply(v ? 19 : null)} label="Напоминание о поливе" />
        </div>
        {hour !== null && (
          <label className="row gap-6 small text-2">
            Время
            <select className="select" style={{ width: "auto" }} value={hour} onChange={(e) => void apply(Number(e.target.value))}>
              {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="small muted">Одно уведомление в выбранный час. Пропуск дня ничего не сбрасывает.</p>
      </div>
    </>
  );
}
