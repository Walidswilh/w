/**
 * Cloudflare Worker — وسيط آمن بين موقع فواتير الوقود وواجهة Anthropic API
 *
 * ما يفعله:
 * 1. يستقبل الطلب من الموقع (بدون أي مفتاح API فيه).
 * 2. يضيف مفتاح API السري (المخزّن كمتغير بيئة على Cloudflare، وليس في الكود).
 * 3. يمرر الطلب إلى https://api.anthropic.com/v1/messages ويعيد الرد كما هو.
 *
 * الإعداد:
 * 1. أنشئ Worker جديد في Cloudflare (Workers & Pages > Create > Create Worker).
 * 2. الصق هذا الكود كاملاً بدل الكود الافتراضي، ثم اضغط Deploy.
 * 3. من إعدادات الـ Worker: Settings > Variables and Secrets > Add
 *    - Name: ANTHROPIC_API_KEY
 *    - Value: مفتاحك من console.anthropic.com
 *    - فعّل خيار "Encrypt" حتى يبقى سري.
 * 4. انسخ رابط الـ Worker (مثل: https://fuel-invoice-proxy.YOUR-SUBDOMAIN.workers.dev)
 *    وضعه في متغير WORKER_URL داخل ملف الموقع (index.html).
 */

// غيّر هذا لاحقاً إلى دومين موقعك على GitHub Pages لتقييد الوصول، مثال:
// const ALLOWED_ORIGIN = "https://username.github.io";
const ALLOWED_ORIGIN = "https://walidswilh.github.io/w/";

export default {
  async fetch(request, env) {
    // السماح بطلب OPTIONS (CORS preflight) الذي يرسله المتصفح تلقائياً
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "لم يتم ضبط ANTHROPIC_API_KEY في إعدادات الـ Worker" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    try {
      const body = await request.text();

      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body,
      });

      const responseBody = await upstream.text();

      return new Response(responseBody, {
        status: upstream.status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "خطأ في الوسيط: " + err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
