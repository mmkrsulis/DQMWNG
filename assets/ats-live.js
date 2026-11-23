/* ATS public snapshot overlay. Aggregate-only; no child identities. */
(async function () {
  const section = document.querySelector('.slide[data-label="Rekap ATS"]');
  if (!section) return;
  const status = section.querySelector('#ats-verification');
  try {
    const response = await fetch('data/ats-live.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Snapshot ATS belum tersedia.');
    const data = await response.json();
    const totals = data.totals || {};
    const expected = ['total', 'do', 'ltm', 'bpb'];
    if (!data.validation || data.validation.status !== 'VALID' || expected.some(k => !Number.isInteger(totals[k]))) {
      throw new Error('Snapshot ATS tidak lolos validasi.');
    }
    const fmt = n => new Intl.NumberFormat('id-ID').format(n);
    const header = section.querySelector('.slide-header');
    if (header) {
      const eyebrow = header.querySelector('.eyebrow');
      const title = header.querySelector('.slide-title');
      const sub = header.querySelector('.slide-sub');
      if (eyebrow) eyebrow.textContent = 'ATS RESMI · ' + (data.meta?.fetched_at_wib?.slice(0, 10) || 'tanggal tidak tersedia');
      if (title) title.innerHTML = fmt(totals.total) + ' catatan <span class="goldtext">anak tidak sekolah</span>';
      if (sub) sub.textContent = 'Rekap resmi Kabupaten Wonogiri · ' + (data.meta?.tahun_ajaran || 'tahun ajaran tidak tercantum') + ' · validasi 25 kecamatan.';
    }
    const cards = section.querySelectorAll('.grid.cols4 .card');
    const values = [totals.do, totals.ltm, totals.bpb];
    const labels = ['DO', 'LTM', 'BPB'];
    cards.forEach((card, i) => {
      if (i > 2) return;
      const label = card.querySelector('.kpi-label');
      const value = card.querySelector('.kpi');
      if (label) label.textContent = labels[i];
      if (value) value.textContent = fmt(values[i]);
    });
    // The old source had a "Tanpa NISN" field; the new public API does not.
    if (cards[3]) cards[3].remove();
    const chart = section.querySelector('#ats-bars');
    if (chart) {
      const rows = [...(data.kecamatan || [])].sort((a, b) => b.total - a.total).slice(0, 8);
      const max = Math.max(1, ...rows.map(r => r.total));
      chart.innerHTML = rows.map(r => {
        const pct = Math.round(100 * r.total / max);
        const name = String(r.kecamatan).replace(/[&<>\"]/g, '');
        return '<div class="bar-row"><span>' + name + '</span><div class="bar-track"><i style="width:' + pct + '%"></i></div><b>' + fmt(r.total) + '</b></div>';
      }).join('');
    }
    if (status) status.textContent = 'Sumber: API publik ATS Kemendikdasmen · ' + (data.meta?.fetched_at_wib || 'waktu tidak tersedia') + '. Angka ATS terpisah dari IKD dan DQM.';
  } catch (error) {
    const title = section.querySelector('.slide-title');
    const sub = section.querySelector('.slide-sub');
    if (title) title.textContent = 'Snapshot ATS belum tersedia';
    if (sub) sub.textContent = 'Data lama tidak ditampilkan sebagai data terkini. Jalankan workflow Sync ATS Wonogiri setelah sumber berhasil diverifikasi.';
    section.querySelectorAll('.grid.cols4 .kpi').forEach(node => { node.textContent = '—'; });
    const chart = section.querySelector('#ats-bars');
    if (chart) chart.textContent = 'Belum ada data ATS tervalidasi.';
    if (status) status.textContent = 'Snapshot ATS otomatis belum tersedia/valid. ' + error.message;
  }
})();
