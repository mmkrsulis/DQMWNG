/* ATS public snapshot overlay. Aggregate-only; no child identities. */
(async function () {
  const section = document.querySelector('.slide[data-label="Rekap ATS"]');
  if (!section) return;
  const status = section.querySelector('#ats-verification');
  const bulanId = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  function formatIndoDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return String(isoStr).slice(0, 10);
    const wib = new Date(d.getTime() + 7 * 3600 * 1000);
    return `${wib.getUTCDate()} ${bulanId[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
  }
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
    const tglIndo = formatIndoDate(data.meta?.fetched_at_wib || data.meta?.fetched_at_utc);
    if (header) {
      const eyebrow = header.querySelector('.eyebrow');
      const title = header.querySelector('.slide-title');
      const sub = header.querySelector('.slide-sub');
      if (eyebrow) eyebrow.textContent = 'ATS RESMI' + (tglIndo ? ' · ' + tglIndo : '');
      if (title) title.innerHTML = fmt(totals.total) + ' catatan <span class="goldtext">anak tidak sekolah</span>';
      if (sub) sub.textContent = 'Rekap resmi Kabupaten Wonogiri · Tahun Ajaran ' + (data.meta?.tahun_ajaran || 'berjalan') + ' · cakupan 25 kecamatan.';
    }
    const cards = section.querySelectorAll('.grid.cols4 .card');
    const values = [totals.do, totals.ltm, totals.bpb];
    const labels = ['DO (Drop Out)', 'LTM (Lulus Tidak Melanjutkan)', 'BPB (Belum Pernah Bersekolah)'];
    cards.forEach((card, i) => {
      if (i > 2) return;
      const label = card.querySelector('.kpi-label');
      const value = card.querySelector('.kpi');
      if (label) label.textContent = labels[i];
      if (value) value.textContent = fmt(values[i]);
    });
    if (cards[3]) cards[3].remove();
    const chart = section.querySelector('#ats-bars');
    if (chart) {
      const rows = [...(data.kecamatan || [])].sort((a, b) => b.total - a.total).slice(0, 8);
      const max = Math.max(1, ...rows.map(r => r.total));
      chart.innerHTML = rows.map(r => {
        const pct = Math.round(100 * r.total / max);
        const name = String(r.kecamatan).replace(/[&<>"]/g, '');
        return '<div class="bar-row"><span>' + name + '</span><div class="bar-track"><i style="width:' + pct + '%"></i></div><b>' + fmt(r.total) + '</b></div>';
      }).join('');
    }
    if (status) {
      status.textContent = 'Sumber: Data ATS Kemendikdasmen' + (tglIndo ? ' (pemutakhiran ' + tglIndo + ')' : '') + ' · Data agregat per kecamatan tanpa identitas individu.';
    }
  } catch (error) {
    const title = section.querySelector('.slide-title');
    const sub = section.querySelector('.slide-sub');
    if (title) title.textContent = 'Data ATS sedang disiapkan';
    if (sub) sub.textContent = 'Rekap Kabupaten Wonogiri akan tampil setelah pembaruan data selesai.';
    section.querySelectorAll('.grid.cols4 .kpi').forEach(node => { node.textContent = '—'; });
    const chart = section.querySelector('#ats-bars');
    if (chart) chart.textContent = 'Belum ada data ATS.';
    if (status) status.textContent = 'Menunggu pembaruan data ATS resmi.';
  }
})();
