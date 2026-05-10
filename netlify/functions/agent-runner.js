/**
 * VetConnect OS — Agent Runner
 * Scheduled daily sweep — runs all 4 agents in sequence.
 * Trigger via Netlify scheduled function or external cron.
 * URL: /.netlify/functions/agent-runner
 */

const { logAction } = require('./agent-utils');

// Import all agent handlers
const voucherAgent  = require('./agent-voucher-expiry');
const veteranAgent  = require('./agent-veteran-risk');
const paymentAgent  = require('./agent-payment-watch');
const propertyAgent = require('./agent-property-health');

exports.handler = async function(event, context) {
  const startTime = Date.now();
  console.log('[AgentRunner] Starting daily sweep...');

  const summary = {
    runAt:   new Date().toISOString(),
    agents:  [],
    totalAlerts: 0,
    errors:  []
  };

  const agents = [
    { name: 'VoucherExpiryAgent',  handler: voucherAgent  },
    { name: 'VeteranRiskAgent',    handler: veteranAgent  },
    { name: 'PaymentAgent',        handler: paymentAgent  },
    { name: 'PropertyHealthAgent', handler: propertyAgent }
  ];

  for (const agent of agents) {
    try {
      console.log(`[AgentRunner] Running ${agent.name}...`);
      const result = await agent.handler.handler(event, context);
      const body   = JSON.parse(result.body || '{}');
      const alerts = body.alerts ? body.alerts.length : 0;

      summary.agents.push({
        name:    agent.name,
        status:  result.statusCode === 200 ? 'success' : 'error',
        checked: body.checked || 0,
        alerts
      });
      summary.totalAlerts += alerts;
      console.log(`[AgentRunner] ${agent.name} complete — ${alerts} alerts`);

    } catch(err) {
      console.error(`[AgentRunner] ${agent.name} failed:`, err.message);
      summary.errors.push({ agent: agent.name, error: err.message });
      summary.agents.push({ name: agent.name, status: 'error', error: err.message });
    }

    // Pause between agents to respect rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[AgentRunner] Sweep complete in ${duration}s. ${summary.totalAlerts} total alerts fired.`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...summary, duration: `${duration}s` })
  };
};
