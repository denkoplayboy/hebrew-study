import { useEffect, useRef } from "react";
import { useDaylight } from "../lib/daylight";

/* Музейный свет над тёмной панелью зала: WebGL-луч, пыль в луче и мягкое зерно.
   Направление и цвет луча — от солнца над Иерусалимом: днём белый сверху, к вечеру
   тёплый и косой, ночью слабый лунный. Без WebGL остаётся CSS-градиент панели.
   Рендер 30 кадров/с, на паузе вне экрана и в фоне; при «уменьшении движения» — один кадр. */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float t;
uniform vec2 src;      // точка источника, uv (0..1, y вниз)
uniform vec3 col;      // цвет света
uniform float power;   // сила луча
uniform float night;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / res;
  uv.y = 1.0 - uv.y;
  float aspect = res.x / res.y;
  vec2 q = vec2(uv.x * aspect, uv.y);
  vec2 s = vec2(src.x * aspect, src.y);

  // конус: расходится от источника вниз и в сторону, мягкие края
  vec2 d = q - s;
  vec2 dir = normalize(vec2((0.5 - src.x) * 0.9 * aspect, 1.0));
  float along = dot(d, dir);
  float across = abs(d.x * dir.y - d.y * dir.x);
  float width = 0.16 + along * 0.7;
  float cone = smoothstep(width, width * 0.25, across) * smoothstep(-0.05, 0.25, along) * exp(-along * 0.9);

  // пыль и воздух в луче
  float haze = fbm(q * 3.0 + vec2(t * 0.02, -t * 0.03));
  vec2 g = q * 38.0 + vec2(0.0, t * 0.35);
  vec2 cell = floor(g);
  vec2 jitter = vec2(hash(cell), hash(cell + 7.1));
  float dist = length(fract(g) - jitter);
  float twinkle = 0.5 + 0.5 * sin(t * 1.7 + hash(cell) * 6.28);
  float mote = smoothstep(0.075, 0.0, dist) * step(0.86, hash(cell + 3.3)) * twinkle;

  // ночью — редкие тёплые огни внизу, как город за окном зала
  float lamps = 0.0;
  if (night > 0.5) {
    vec2 lg = vec2(q.x * 26.0, q.y * 9.0);
    vec2 lc = floor(lg);
    float on = step(0.93, hash(lc + 11.0)) * smoothstep(0.55, 1.0, uv.y);
    lamps = on * smoothstep(0.2, 0.0, length(fract(lg) - 0.5)) * (0.7 + 0.3 * sin(t * 0.8 + hash(lc) * 9.0));
  }

  float light = cone * power * (0.55 + 0.6 * haze) + mote * cone * power * 1.6;
  vec3 c = col * light + vec3(1.0, 0.72, 0.38) * lamps * 0.5;
  float grain = (hash(gl_FragCoord.xy + fract(t)) - 0.5) * 0.025;
  float a = clamp(light + lamps * 0.5 + grain, 0.0, 1.0);
  gl_FragColor = vec4(c + grain, a);
}`;

export function HallLight() {
  const ref = useRef<HTMLCanvasElement>(null);
  const day = useDaylight();
  const dayRef = useRef(day);
  dayRef.current = day;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const o = gl.createShader(type)!;
      gl.shaderSource(o, src);
      gl.compileShader(o);
      return o;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u("res"), uT = u("t"), uSrc = u("src"), uCol = u("col"), uPow = u("power"), uNight = u("night");
    canvas.dataset.on = "1";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let visible = true;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = (now: number) => {
      const d = dayRef.current;
      resize();
      // солнце на востоке (утро) — луч слева, на западе (вечер) — справа; ниже солнце — круче косой луч
      const side = Math.sin((d.az * Math.PI) / 180); // восток > 0
      const low = 1 - Math.min(1, Math.max(0, d.el) / 60);
      const sx = 0.5 - side * 0.38 * (0.35 + low * 0.65);
      const night = d.phase === "night";
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform2f(uSrc, sx, -0.15);
      gl.uniform3f(uCol, d.color[0], d.color[1], d.color[2]);
      gl.uniform1f(uPow, night ? 0.45 : d.phase === "twilight" ? 0.7 : 0.9);
      gl.uniform1f(uNight, night ? 1 : 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - last > 33) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced) {
        draw(performance.now());
        return;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const onVis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => reduced && draw(performance.now()));
    ro.observe(canvas);
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className="hall-light" aria-hidden />;
}
