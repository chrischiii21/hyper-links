const text = `Part 2: Rebuilt Report

# Section I: Executive Summary
•\\tClimateAI delivers AI-powered, 1km-resolution climate risk intelligence for the food and agriculture sector.
•\\tThe ClimateLens™ platform provides three product variants — Monitor, Adapt, and Monitor Yield Outlook.
•\\tSaaS recurring software revenue with enterprise contracts.
•\\tEnterprise clients in agribusiness, food and beverage, finance, and government across 80+ countries.
•\\tNo verified G2 or Capterra reviews as of June 2026.
•\\tFaces platform competition from Jupiter Intelligence, adjacent competition from Tomorrow.io, and point solution competition from Cervest.
•\\tFounded in 2017 by Himanshu Gupta and Maximilian Evans.
•\\tDirect enterprise sales motion led from San Francisco.
•\\tCloud-native SaaS with seven U.S. patents in AI-based climate forecasting.
•\\tClimateAI operates in the climate risk intelligence software market, positioned as an operational and strategic supply chain layer.

Source: Website, website.com`;

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
