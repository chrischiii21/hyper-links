const text = `Part 2: Rebuilt Report

# Section V: Customer Feedback & Testimonials
Customer Level of Satisfaction
•\tG2: ClimateAI has a profile on G2 with 0 verified reviews as of June 2026. No aggregate rating is available.
•\tCapterra: ClimateAI is not listed on Capterra as of June 2026.
•\tTrustRadius: Not found on TrustRadius as of June 2026.
•\tGartner Peer Insights: ClimateAI is listed under the Climate Risk Tools category on Gartner Peer Insights but has no confirmed reviews as of June 2026.

Customer ROI
ClimateAI’s decision accuracy page states that its 6-month outlooks have been validated as 50–60% more accurate than historical baseline data (Source: ClimateAI, 2024, https://climate.ai/decision-accuracy/). No independently verified customer ROI figure has been publicly disclosed.

Offering Strengths
•\tEarly warning precision: The Head of Suntory Global Supply Solutions noted that ClimateAI...`;

fetch('http://localhost:4321/api/extract-paste', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text })
})
.then(res => {
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  return res.json();
})
.then(data => {
  // Customer Feedback & Testimonials is index 4 (Section V)
  const feedbackSection = data.find(s => s.id === 5);
  if (!feedbackSection) {
    console.error("❌ Customer Feedback section not found in API response!");
    process.exit(1);
  }
  
  console.log("=== CUSTOMER FEEDBACK & TESTIMONIALS BODY ===");
  console.log(feedbackSection.body);
  
  const hasRoiText = feedbackSection.body.includes("ClimateAI’s decision accuracy page states");
  const hasRoiSource = feedbackSection.body.includes("Climate - Ai");
  
  if (hasRoiText) {
    console.log("\n✅ [PASS] Customer ROI content was successfully preserved!");
  } else {
    console.error("\n❌ [FAIL] Customer ROI content is missing!");
    process.exit(1);
  }
  
  if (hasRoiSource) {
    console.log("✅ [PASS] Customer ROI source link was successfully extracted to sources!");
  } else {
    console.error("❌ [FAIL] Customer ROI source link was not extracted!");
    process.exit(1);
  }
})
.catch(err => {
  console.error("Error connecting to API:", err);
  process.exit(1);
});
