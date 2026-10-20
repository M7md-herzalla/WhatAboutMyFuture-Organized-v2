/**
 * Cloudflare Worker - ماذا عن مستقبلي؟
 * ------------------------------------------------------------
 * مسارين:
 *   POST /api/analyze  -> تحليل نتائج الاختبارات (بديل server.js)
 *   POST (أي مسار آخر) -> بروكسي الشات مع Gemini (ai.html)
 *
 * الإعداد (مرة وحدة):
 *   wrangler secret put GEMINI_API_KEY
 *   في wrangler.toml تحت [vars]:
 *     ALLOWED_ORIGINS = "https://دومينك.com,http://127.0.0.1:5500"
 *     GEMINI_MODEL    = "gemini-2.5-flash"      (اختياري)
 *   (اختياري) KV Namespace باسم RATE_LIMIT_KV لتفعيل الحد من الطلبات
 *   wrangler deploy
 */

import { buildAnalysisPrompt } from './Backend/prompts/analysisPrompt.js';

const DEFAULT_ORIGINS = ['http://127.0.0.1:5500', 'http://localhost:5500'];
const DEFAULT_MODEL = 'gemini-2.5-flash';

// ---------- حدود الحماية ----------
const CHAT_LIMIT = { max: 15, windowSec: 60 };
const ANALYZE_LIMIT = { max: 5, windowSec: 600 };
const MAX_BODY_BYTES = 100 * 1024;
const CHAT_MAX_MESSAGES = 20;
const CHAT_MAX_CHARS = 4000;
const RECOMMENDED_MAJORS_COUNT = 10;

const EXAM_TYPES = ['career', 'skills', 'personality', 'learning', 'interests'];

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ success: false, error: 'الطريقة غير مسموحة' }, 405, cors);
    }

    const origin = request.headers.get('Origin') || '';
    if (origin && !allowedOrigins(env).includes(origin)) {
      return json({ success: false, error: 'مصدر الطلب غير مسموح' }, 403, cors);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ success: false, error: 'لم يتم إعداد مفتاح Gemini على الخادم' }, 500, cors);
    }

    const { pathname } = new URL(request.url);
    const isAnalyze = pathname === '/api/analyze';
    const limit = isAnalyze ? ANALYZE_LIMIT : CHAT_LIMIT;

    if (env.RATE_LIMIT_KV) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ok = await checkRateLimit(env.RATE_LIMIT_KV, `${isAnalyze ? 'an' : 'ch'}:${ip}`, limit);
      if (!ok) {
        return json({ success: false, error: 'عدد كبير من الطلبات، حاول بعد قليل.' }, 429, cors);
      }
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return json({ success: false, error: 'حجم الطلب كبير جداً' }, 413, cors);
      }
      body = JSON.parse(text);
    } catch {
      return json({ success: false, error: 'صيغة الطلب غير صحيحة' }, 400, cors);
    }

    return isAnalyze
      ? handleAnalyze(body, env, cors)
      : handleChat(body, env, cors);
  },
};

// ============================================================
// تحليل الاختبارات
// ============================================================

async function handleAnalyze(body, env, cors) {
  const exams = sanitizeExams(body && body.exams);
  if (!exams) {
    return json({ success: false, error: 'بيانات الاختبارات غير صالحة.' }, 400, cors);
  }

  const prompt = buildAnalysisPrompt(exams);

  // محاولتان: إذا رجع JSON ناقص أو غير صالح نعيد مرة وحدة
  let lastError = 'Failed to analyze answers.';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await callGemini(env, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 8192,
        },
      });

      let analysis = JSON.parse(cleanJson(text));
      analysis = normalizeAnalysis(analysis);
      validateAnalysis(analysis);

      return json({ success: true, analysis }, 200, cors);
    } catch (err) {
      lastError = err.message || lastError;
      console.error(`analyze attempt ${attempt} failed:`, lastError);
    }
  }
  return json({ success: false, error: 'تعذر إكمال التحليل، حاول مرة أخرى.' }, 502, cors);
}

/**
 * نعيد بناء بيانات الاختبارات من القيم الرقمية فقط.
 * لا نمرر نصوص الأسئلة أو الإجابات القادمة من المتصفح للنموذج،
 * وهيك ما حدا يقدر يحقن تعليمات داخل الـ prompt.
 */
function sanitizeExams(exams) {
  if (!Array.isArray(exams) || exams.length === 0 || exams.length > EXAM_TYPES.length) {
    return null;
  }

  const clean = [];
  const seen = new Set();

  for (const exam of exams) {
    if (!exam || !EXAM_TYPES.includes(exam.examType) || seen.has(exam.examType)) return null;
    if (!Array.isArray(exam.answers) || exam.answers.length === 0 || exam.answers.length > 60) return null;
    seen.add(exam.examType);

    const answers = [];
    for (const a of exam.answers) {
      if (!a) return null;
      const value = Number(a.value);
      if (!Number.isInteger(value) || value < 1 || value > 5) return null;
      if (typeof a.dimension !== 'string' || !/^[A-Za-z]{1,30}$/.test(a.dimension)) return null;
      answers.push({ dimension: a.dimension, reverse: a.reverse === true, value });
    }
    clean.push({ examType: exam.examType, answers });
  }
  return clean;
}

function cleanJson(text) {
  return String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
}

function normalizeAnalysis(analysis) {
  if (!analysis || !Array.isArray(analysis.recommendedMajors)) return analysis;
  analysis.recommendedMajors = analysis.recommendedMajors
    .slice()
    .sort((a, b) => Number(b.compatibilityScore) - Number(a.compatibilityScore))
    .map((m, i) => ({ ...m, rank: i + 1 }));
  return analysis;
}

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every(isStr);

function validateAnalysis(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('not an object');

  const p = a.studentProfile;
  if (!p || typeof p !== 'object') throw new Error('studentProfile missing');
  for (const f of ['summary', 'thinkingStyle', 'learningStyle', 'workEnvironment']) {
    if (!isStr(p[f])) throw new Error(`studentProfile.${f} invalid`);
  }

  if (!isStrArr(a.strengths, 3)) throw new Error('strengths invalid');
  if (!isStrArr(a.developmentAreas, 2)) throw new Error('developmentAreas invalid');

  const majors = a.recommendedMajors;
  if (!Array.isArray(majors) || majors.length !== RECOMMENDED_MAJORS_COUNT) {
    throw new Error(`recommendedMajors must contain ${RECOMMENDED_MAJORS_COUNT} items`);
  }
  majors.forEach((m, i) => {
    if (!m || typeof m !== 'object') throw new Error(`major ${i + 1} invalid`);
    if (!isStr(m.major)) throw new Error(`major ${i + 1} name invalid`);
    if (!Number.isInteger(m.compatibilityScore) || m.compatibilityScore < 0 || m.compatibilityScore > 100) {
      throw new Error(`major ${i + 1} score invalid`);
    }
    if (!isStr(m.reason)) throw new Error(`major ${i + 1} reason invalid`);
    if (!isStrArr(m.requiredSkills)) throw new Error(`major ${i + 1} skills invalid`);
    if (!isStrArr(m.careerPaths)) throw new Error(`major ${i + 1} careers invalid`);
  });

  const names = majors.map((m) => m.major.trim().toLowerCase().replace(/\s+/g, ' '));
  if (new Set(names).size !== names.length) throw new Error('duplicate majors');

  if (!isStrArr(a.developmentPlan, 3)) throw new Error('developmentPlan invalid');
  if (!isStr(a.disclaimer)) throw new Error('disclaimer invalid');
}

// ============================================================
// شات الذكاء الاصطناعي (ai.html)
// ============================================================

async function handleChat(body, env, cors) {
  const contents = body && body.contents;
  if (!Array.isArray(contents) || contents.length === 0 || contents.length > CHAT_MAX_MESSAGES) {
    return jsonChatError('بيانات الطلب ناقصة', 400, cors);
  }

  // نمرر فقط الحقول المتوقعة وبحدود طول، ونمنع أي أدوات أو إعدادات إضافية
  const safeContents = [];
  for (const msg of contents) {
    const role = msg && msg.role === 'model' ? 'model' : 'user';
    const text = msg && Array.isArray(msg.parts) && msg.parts[0] && msg.parts[0].text;
    if (typeof text !== 'string' || !text.trim() || text.length > CHAT_MAX_CHARS) {
      return jsonChatError('رسالة غير صالحة', 400, cors);
    }
    safeContents.push({ role, parts: [{ text }] });
  }

  const payload = { contents: safeContents };
  const sys = body.system_instruction && body.system_instruction.parts && body.system_instruction.parts[0];
  if (sys && typeof sys.text === 'string' && sys.text.length <= CHAT_MAX_CHARS) {
    payload.system_instruction = { parts: [{ text: sys.text }] };
  }

  try {
    const res = await fetch(geminiUrl(env), {
      method: 'POST',
      headers: geminiHeaders(env),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50000),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error('non-JSON from Gemini:', res.status, raw.slice(0, 300));
      return jsonChatError(`رد غير متوقع من Gemini (HTTP ${res.status})`, 502, cors);
    }
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    console.error('chat error:', err);
    return jsonChatError(`تعذر الاتصال بخدمة Gemini (${err.name}: ${err.message})`, 502, cors);
  }
}

// ============================================================
// Gemini
// ============================================================

function geminiUrl(env) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// المفتاح بالـ header وليس بالرابط، حتى ما يظهر بسجلات الطلبات
function geminiHeaders(env) {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY };
}

async function callGemini(env, payload) {
  const res = await fetch(geminiUrl(env), {
    method: 'POST',
    headers: geminiHeaders(env),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55000),
  });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Gemini non-JSON response (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

// ============================================================
// أدوات مساعدة
// ============================================================

function allowedOrigins(env) {
  if (!env.ALLOWED_ORIGINS) return DEFAULT_ORIGINS;
  return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : list[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// ai.html يقرأ data.error.message
function jsonChatError(message, status, cors) {
  return json({ error: { message } }, status, cors);
}

async function checkRateLimit(kv, key, { max, windowSec }) {
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= max) return false;
  await kv.put(key, String(count + 1), { expirationTtl: Math.max(60, windowSec) });
  return true;
}
