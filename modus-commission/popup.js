var enabled = document.getElementById("enabled");
var count = document.getElementById("count");
function refresh() {
  chrome.storage.local.get({ enabled: true, overrides: {} }, function (s) {
    enabled.checked = s.enabled;
    var n = Object.keys(s.overrides).length;
    count.textContent = n + " manual pick" + (n === 1 ? "" : "s") + " saved.";
  });
}
enabled.addEventListener("change", function () {
  chrome.storage.local.set({ enabled: enabled.checked });
});
document.getElementById("clear").addEventListener("click", function () {
  chrome.storage.local.set({ overrides: {}, prefGrids: {} }, refresh);
});
refresh();
