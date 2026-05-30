exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const base = "appooo5Vcblwu8Ysn";
    const table = "tblwOqhwXxHlA1Ka9";
    const response = await fetch(
      `https://api.airtable.com/v0/${base}/${table}?maxRecords=50`,
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

