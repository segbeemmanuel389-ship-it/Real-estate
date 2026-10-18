const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const interests = new Set([
  "Buying a property",
  "Renting a property",
  "Short let",
  "Land",
  "Investment",
  "Other enquiry",
]);
const fieldNames = ["firstName", "lastName", "email", "phone", "interest", "message"] as const;
type FieldName = (typeof fieldNames)[number];

function jsonResponse(body: Record<string, string | boolean>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > 20_000) {
      return jsonResponse({ error: "Request is too large." }, 413);
    }
    const parsed = JSON.parse(new TextDecoder().decode(body));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  if (typeof payload.website === "string" && payload.website.trim()) {
    return jsonResponse({ message: "Request received.", saved: true }, 200);
  }

  const values = {} as Record<FieldName, string>;
  for (const field of fieldNames) {
    const value = payload[field];
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 4000) {
      return jsonResponse({ error: `Please provide a valid ${field}.`, saved: false }, 400);
    }
    values[field] = value.trim();
  }
  if (values.firstName.length > 100 || values.lastName.length > 100 || values.phone.length > 40) {
    return jsonResponse({ error: "One or more contact fields are too long.", saved: false }, 400);
  }
  if (/[\u0000-\u001f\u007f]/.test(values.firstName) || /[\u0000-\u001f\u007f]/.test(values.lastName)) {
    return jsonResponse({ error: "Please provide a valid name.", saved: false }, 400);
  }
  if (!/^\+?[0-9][0-9\s().-]{5,38}[0-9]$/.test(values.phone)) {
    return jsonResponse({ error: "Please provide a valid phone number.", saved: false }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) {
    return jsonResponse({ error: "Please provide a valid email address.", saved: false }, 400);
  }
  if (!interests.has(values.interest)) {
    return jsonResponse({ error: "Please choose a valid consultation interest.", saved: false }, 400);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(values.message)) {
    return jsonResponse({ error: "Please provide a valid message.", saved: false }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase URL or service-role key is not configured for the consultation function.");
    return jsonResponse({ error: "Consultation storage is not configured.", saved: false }, 500);
  }

  const supabaseBaseUrl = supabaseUrl.replace(/\/+$/, "");
  let saveResponse: Response;
  try {
    saveResponse = await fetch(`${supabaseBaseUrl}/rest/v1/consultation_requests`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        first_name: values.firstName,
        last_name: values.lastName,
        email: values.email,
        phone: values.phone,
        interest: values.interest,
        message: values.message,
      }),
    });
  } catch (error) {
    console.error("Could not save consultation request:", error);
    return jsonResponse({
      error: "Could not save your consultation request. Please try again.",
      saved: false,
    }, 502);
  }
  if (!saveResponse.ok) {
    const details = await saveResponse.text();
    console.error("Supabase rejected consultation request:", saveResponse.status, details);
    return jsonResponse({
      error: "Could not save your consultation request. Please try again.",
      saved: false,
    }, 502);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.error("Resend is not configured. Check RESEND_API_KEY and RESEND_FROM_EMAIL function secrets.");
    return jsonResponse({
      error: "Your request was saved, but email notification is not configured.",
      saved: true,
    }, 500);
  }

  let recipients: string[];
  try {
    const ownerProfilesResponse = await fetch(
      `${supabaseBaseUrl}/rest/v1/profiles?role=eq.owner&select=id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (!ownerProfilesResponse.ok) {
      const details = await ownerProfilesResponse.text();
      console.error("Could not look up owner profiles:", ownerProfilesResponse.status, details);
      return jsonResponse({
        error: "Your request was saved, but we could not look up the owner's email.",
        saved: true,
      }, 502);
    }

    const profiles = await ownerProfilesResponse.json() as { id: string }[];
    const ownerUsers = await Promise.all(profiles.map(async ({ id }) => {
      const userResponse = await fetch(
        `${supabaseBaseUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );
      if (!userResponse.ok) {
        const details = await userResponse.text();
        console.error(`Could not resolve email for owner ${id}:`, userResponse.status, details);
        throw new Error("Could not resolve owner email addresses.");
      }
      return await userResponse.json() as { email?: string };
    }));
    recipients = [...new Set(ownerUsers
      .map((user) => user.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)))];
  } catch (error) {
    console.error("Owner email lookup failed:", error);
    return jsonResponse({
      error: "Your request was saved, but we could not look up the owner's email.",
      saved: true,
    }, 502);
  }

  if (recipients.length === 0) {
    console.error("No Supabase profile has the owner role.");
    return jsonResponse({
      error: "Your request was saved, but no owner account is configured to receive it.",
      saved: true,
    }, 409);
  }

  const fullName = `${values.firstName} ${values.lastName}`;
  const html = [
    "<h2>New consultation request</h2>",
    `<p><strong>Name:</strong> ${escapeHtml(fullName)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(values.email)}</p>`,
    `<p><strong>Phone:</strong> ${escapeHtml(values.phone)}</p>`,
    `<p><strong>Property of interest:</strong> ${escapeHtml(values.interest)}</p>`,
    `<p><strong>Message:</strong><br>${escapeHtml(values.message).replace(/\r?\n/g, "<br>")}</p>`,
  ].join("");
  const text = [
    "New consultation request",
    `Name: ${fullName}`,
    `Email: ${values.email}`,
    `Phone: ${values.phone}`,
    `Property of interest: ${values.interest}`,
    "",
    values.message,
  ].join("\n");

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        reply_to: values.email,
        subject: "New consultation request",
        html,
        text,
      }),
    });
  } catch (error) {
    console.error("Resend request failed:", error);
    return jsonResponse({
      error: "Your request was saved, but email delivery failed. Please contact us if you need an immediate response.",
      saved: true,
    }, 502);
  }

  if (!response.ok) {
    const details = await response.text();
    console.error("Resend rejected consultation email:", response.status, details);
    return jsonResponse({
      error: "Your request was saved, but email delivery failed. Please contact us if you need an immediate response.",
      saved: true,
    }, 502);
  }

  return jsonResponse({ message: "Consultation request saved and emailed to the owner.", saved: true }, 200);
});
