// netlify/functions/airtable.js
// Accepts optional ?table= query param to query any table in the base
// Default is Deck Leads (tblnDM50dD7d8Fkjy) — the unified CRM

exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const base = "appooo5Vcblwu8Ysn";
    // Accept ?table= param — default to Deck Leads
    const table = (event.queryStringParameters && event.queryStringParameters.table)
      ? event.queryStringParameters.table
      : "tblnDM50dD7d8Fkjy";

    const max = (event.queryStringParameters && event.queryStringParameters.max)
      ? event.queryStringParameters.max
      : "100";

    const response = await fetch(
      `https://api.airtable.com/v0/${base}/${table}?maxRecords=${max}`,
      {
        headers: {
          "Authorization": `Bearer ${process.env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
