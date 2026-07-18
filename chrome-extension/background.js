/**
 * Makes the toolbar icon open the side panel directly, instead of a popup.
 */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Hyperlinks: failed to set side panel behavior:', error));
