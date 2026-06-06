const text = `Part 2: Rebuilt Report

# Section I: Executive Summary
•\tValue Proposition: ClimateAI delivers AI-powered, 1km-resolution climate risk intelligence for the food and agriculture sector, enabling enterprise clients to manage supply chain disruptions, optimise sourcing, and adapt long-term strategy to climate volatility — without requiring data science capability.
•\tProduct Offering: The ClimateLens™ platform provides three product variants — Monitor (1–6 month operational), Adapt (10+ year strategic), and Monitor Yield Outlook (commodity crop yields) — plus the LensConnect™ API for programmatic data integration.
•\tBusiness Model: SaaS recurring software revenue with enterprise contracts; pricing and contract terms are not publicly disclosed. The company operates a cloud-native, multi-tenant platform.
•\tCustomer Profile: Enterprise clients in agribusiness, food and beverage, finance, and government across 80+ countries; named customers include Dole, Driscoll’s, Suntory, Oatly, Nuveen Natural Capital, and Advanta Seeds.
•\tCustomer Feedback: No verified G2 or Capterra reviews as of June 2026; company-published customer testimonials and case studies indicate high satisfaction with forecast accuracy, early warning precision, and ease of onboarding.
•\tCompetitive Landscape: Faces platform competition from Jupiter Intelligence (financial risk focus), adjacent competition from Tomorrow.io (operational weather intelligence), and point solution competition from Cervest (ESG-focused physical risk).
•\tLeadership: Founded in 2017 by Himanshu Gupta (CEO) and Maximilian Evans (co-founder, retired); David Farnham (VP of AI and Engineering, PhD Columbia) leads technical operations. Co-founder CTO departure is the primary succession risk.
•\tSales & GTM: Direct enterprise sales motion led from San Francisco; emerging technology partnerships (NEC, Hitachi) and institutional channels (AIM for Climate, government contracts) supplement commercial sales.
•\tR&D: Cloud-native SaaS with seven U.S. patents in AI-based climate forecasting; physics-informed ML models at 1km resolution using generative AI and ensemble architectures; engineering offices in San Francisco and Querétaro, Mexico.
•\tMarket: ClimateAI operates in the climate risk intelligence software market, positioned as an operational and strategic supply chain layer. Mandatory CSRD and TCFD climate disclosures and increasing extreme weather severity are the primary near-term growth drivers.`;

fetch('http://localhost:4321/api/extract-paste', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text })
})
.then(res => res.json())
.then(data => {
  const execSummary = data.find(s => s.id === 1);
  console.log("=== EXECUTIVE SUMMARY BODY ===");
  console.log(execSummary ? execSummary.body : "NOT FOUND");
})
.catch(err => console.error("Error:", err));
