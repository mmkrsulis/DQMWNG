(function () {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateValue(el) {
    if (reducedMotion) return;
    const raw = (el.dataset.targetText || el.textContent || "").trim();
    const match = raw.match(/^([\d.,]+)(.*)$/);
    if (!match) return;
    el.dataset.targetText = raw;

    const numStr = match[1];
    const suffix = match[2] || "";
    const decimals = numStr.includes(",") ? (numStr.split(",")[1]?.length || 0) : 0;
    const target = parseFloat(numStr.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(target) || target === 0) return;

    const duration = 650;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      const formatted = (target * ease).toLocaleString("id-ID", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
      el.textContent = formatted + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = raw;
    }
    requestAnimationFrame(tick);
  }

  function runSlidePolish() {
    const active = document.querySelector(".slide.active");
    if (!active) return;
    active
      .querySelectorAll(".ikd-official-score strong, .ikd-indicator-card strong, .county-kpis strong, .cover-evidence strong")
      .forEach(animateValue);
  }

  window.addEventListener("slidechange", runSlidePolish);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runSlidePolish);
  } else {
    setTimeout(runSlidePolish, 80);
  }

  // Quick Slide Jump Drawer saat klik #foot-label atau tekan tombol 'G'
  const foot = document.getElementById("foot-label");
  const allSlides = [...document.querySelectorAll(".slide")];
  if (foot && allSlides.length) {
    const drawer = document.createElement("div");
    drawer.className = "slide-jump-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Daftar Slide");
    drawer.hidden = true;

    function renderDrawer() {
      const currentIdx = allSlides.findIndex((s) => s.classList.contains("active"));
      drawer.innerHTML = allSlides
        .map((s, idx) => {
          const title = s.querySelector("h1, h2")?.textContent?.trim() || s.dataset.label || `Slide ${idx + 1}`;
          const num = String(idx + 1).padStart(2, "0");
          return `<button type="button" class="slide-jump-item${idx === currentIdx ? " current" : ""}" data-jump="${idx}"><span class="slide-jump-num">${num}</span><span>${title}</span></button>`;
        })
        .join("");
      drawer.querySelectorAll("[data-jump]").forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.dataset.jump);
          if (typeof window.showSlide === "function") window.showSlide(idx);
          drawer.hidden = true;
        };
      });
    }

    document.body.appendChild(drawer);
    foot.title = "Klik untuk lompat ke slide tertentu (G)";
    foot.addEventListener("click", (e) => {
      e.stopPropagation();
      renderDrawer();
      drawer.hidden = !drawer.hidden;
    });
    document.addEventListener("pointerdown", (e) => {
      if (!drawer.hidden && !drawer.contains(e.target) && e.target !== foot) drawer.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        renderDrawer();
        drawer.hidden = !drawer.hidden;
      } else if (e.key === "Escape" && !drawer.hidden) {
        drawer.hidden = true;
      }
    });
  }
})();
