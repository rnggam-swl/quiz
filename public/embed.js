/*!
 * Quiz embed loader — docs/07-embed.md
 *   <div data-quiz="SLUG"></div>
 *   <script src="https://YOUR-QUIZ-DOMAIN/embed.js" async></script>
 * Optional attributes: data-session, data-theme (light|dark), data-token, data-title.
 * Events bubble from the container: quiz:ready, quiz:started, quiz:answered, quiz:completed.
 * Control: container.quiz.restart(), container.quiz.setTheme({ primary: "#4f5bea", mode: "dark" }).
 * Protocol: src/lib/embed-protocol.ts — keep in sync.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var base = script && script.src ? new URL(script.src).origin : location.origin;

  function mount(el) {
    if (el.getAttribute("data-quiz-mounted")) return;
    var slug = el.getAttribute("data-quiz") || "";
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return;
    el.setAttribute("data-quiz-mounted", "1");

    var params = new URLSearchParams();
    ["session", "theme", "token", "lang"].forEach(function (key) {
      var value = el.getAttribute("data-" + key);
      if (value) params.set(key, value);
    });
    var query = params.toString();

    var iframe = document.createElement("iframe");
    iframe.src = base + "/embed/" + slug + (query ? "?" + query : "");
    iframe.title = el.getAttribute("data-title") || "Quiz";
    iframe.allow = "fullscreen; autoplay";
    iframe.loading = "lazy";
    iframe.style.cssText = "display:block;width:100%;min-height:480px;border:0;border-radius:16px";
    el.appendChild(iframe);

    function send(type, payload) {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { source: "quiz-host", type: type, payload: payload || {} },
          base,
        );
      }
    }

    window.addEventListener("message", function (event) {
      if (event.origin !== base || event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.source !== "quiz-embed" || typeof data.type !== "string") return;
      if (data.type === "resize" && data.payload && data.payload.height > 0) {
        iframe.style.height = Math.ceil(data.payload.height) + "px";
      }
      el.dispatchEvent(
        new CustomEvent("quiz:" + data.type, { detail: data.payload, bubbles: true }),
      );
    });

    el.quiz = {
      iframe: iframe,
      restart: function () {
        send("restart");
      },
      setTheme: function (theme) {
        send("setTheme", theme);
      },
    };
  }

  function scan() {
    var nodes = document.querySelectorAll("[data-quiz]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  window.QuizEmbed = { scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
