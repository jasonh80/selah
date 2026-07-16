// The ONE neutral, client-safe source for ESV/Crossway attribution (owner
// direction, PR #33, 2026-07-16). No secrets, no server imports — both the
// server API response and every UI surface consume THIS module, so no
// competing or abridged notice can exist anywhere else.
//
// The notice below is copied VERBATIM from Crossway's official ESV API terms
// (https://api.esv.org/ — copyright notice Option 1). Do not paraphrase,
// shorten, or restyle it; a modified notice is a licensing defect. The terms
// also require the letters "ESV" with each quotation and a link to
// www.esv.org on each page that uses the text.

export const ESV_ATTRIBUTION_NOTICE =
  "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language. Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.";

export const ESV_ORG_URL = "https://www.esv.org";

/** The short label the terms require with each quotation. */
export const ESV_SHORT_LABEL = "ESV";
