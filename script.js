const candidateCards = [...document.querySelectorAll('.candidate-card:not(.fixed)')];
const candidateData = new Map();
const confirmed = new Map([
  ['federal', { role: 'Deputada Federal', number: '4511', name: 'Tayane Mãe do Gui' }]
]);

const normalizeLine = (line) => {
  const match = line.trim().match(/^(.*?)\s+[—–-]\s+(\d+)$/);
  return match ? { name: match[1].trim(), number: match[2] } : null;
};

async function loadCandidateLists() {
  const files = [...new Set(candidateCards.map((card) => card.dataset.file))];
  await Promise.all(files.map(async (file) => {
    try {
      const response = await fetch(encodeURI(file));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = (await response.text()).split(/\r?\n/).map(normalizeLine).filter(Boolean);
      candidateData.set(file, new Map(rows.map((row) => [row.number, row.name])));
    } catch {
      candidateData.set(file, new Map());
    }
  }));
}

const listReady = loadCandidateLists();
const confirmSound = document.querySelector('#confirm-sound');
const viewBallot = document.querySelector('#view-ballot');
const ballotStatus = document.querySelector('#ballot-status');
const toast = document.querySelector('#toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function updateBallotState() {
  const complete = confirmed.size === 6;
  viewBallot.disabled = !complete;
  ballotStatus.textContent = complete
    ? 'Sua colinha está pronta para visualizar e compartilhar!'
    : `Faltam ${6 - confirmed.size} ${6 - confirmed.size === 1 ? 'candidato' : 'candidatos'} para confirmar.`;
}

function resetCard(card) {
  const input = card.querySelector('input');
  const button = card.querySelector('button');
  const output = card.querySelector('output');
  card.classList.remove('confirmed');
  input.disabled = false;
  button.disabled = false;
  button.textContent = 'Confirmar';
  output.textContent = '';
  output.classList.remove('error');
  confirmed.delete(card.dataset.role);
  updateBallotState();
}

async function confirmCandidate(card) {
  await listReady;
  const input = card.querySelector('input');
  const button = card.querySelector('button');
  const output = card.querySelector('output');
  const digits = Number(card.dataset.digits);
  const value = input.value.replace(/\D/g, '').slice(0, digits);
  input.value = value;

  if (card.classList.contains('confirmed')) {
    resetCard(card);
    input.focus();
    return;
  }

  if (value.length !== digits) {
    output.textContent = `Digite os ${digits} números do candidato.`;
    output.classList.add('error');
    input.focus();
    return;
  }

  const candidateName = candidateData.get(card.dataset.file)?.get(value);
  if (!candidateName) {
    output.textContent = 'Candidato não encontrado. Confira o número.';
    output.classList.add('error');
    input.focus();
    return;
  }

  if (card.dataset.role === 'senador1' || card.dataset.role === 'senador2') {
    const otherRole = card.dataset.role === 'senador1' ? 'senador2' : 'senador1';
    const otherSenator = confirmed.get(otherRole);
    if (otherSenator?.number === value) {
      output.textContent = 'O 1º e o 2º senador precisam ser diferentes.';
      output.classList.add('error');
      input.focus();
      return;
    }
  }

  const role = card.querySelector('label').textContent;
  output.textContent = candidateName;
  output.classList.remove('error');
  card.classList.add('confirmed');
  input.disabled = true;
  button.disabled = false;
  button.textContent = 'Alterar';
  confirmed.set(card.dataset.role, { role, number: value, name: candidateName });
  updateBallotState();
}

candidateCards.forEach((card) => {
  const input = card.querySelector('input');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, Number(card.dataset.digits));
    card.querySelector('output').classList.remove('error');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmCandidate(card);
    }
  });
  card.querySelector('.confirm-candidate').addEventListener('click', () => confirmCandidate(card));
});

const dialog = document.querySelector('#ballot-dialog');
const summary = document.querySelector('#ballot-summary');
const order = ['federal', 'estadual', 'senador1', 'senador2', 'governador', 'presidente'];

function ballotText() {
  const lines = order.map((key) => {
    const item = confirmed.get(key);
    return `${item.role}: ${item.number} — ${item.name}`;
  });
  return `MINHA COLINHA ELEITORAL\n\n${lines.join('\n')}\n\nDeputada Federal é Tayane Mãe do Gui — 4511!`;
}

viewBallot.addEventListener('click', () => {
  if (confirmed.size !== 6) return;
  confirmSound.currentTime = 0;
  confirmSound.play().catch(() => {});
  summary.innerHTML = order.map((key) => {
    const item = confirmed.get(key);
    return `<div class="summary-row"><div><span>${item.role}</span><strong>${item.name}</strong></div><b>${item.number}</b></div>`;
  }).join('');
  dialog.showModal();
  document.body.classList.add('dialog-open');
});

function closeDialog() {
  dialog.close();
  document.body.classList.remove('dialog-open');
}

document.querySelector('.dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });

document.querySelector('#share-whatsapp').addEventListener('click', () => {
  window.open(`https://wa.me/?text=${encodeURIComponent(ballotText())}`, '_blank', 'noopener,noreferrer');
});

document.querySelector('#copy-ballot').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(ballotText());
    showToast('Colinha copiada!');
  } catch {
    showToast('Não foi possível copiar automaticamente.');
  }
});

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

async function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function downloadBallotImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1600;
  const context = canvas.getContext('2d');
  const pink = '#e7005b';
  const purple = '#2c0c8d';
  const yellow = '#ffcc00';
  const muted = '#6f6a86';

  await document.fonts.ready;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = pink;
  context.lineWidth = 28;
  roundedRect(context, 24, 24, 1032, 1552, 42);
  context.stroke();

  context.fillStyle = pink;
  roundedRect(context, 245, 75, 590, 165, 34);
  context.fill();

  try {
    const logo = await loadCanvasImage('LOGO/LOGO RODAPÉ.png');
    const maxWidth = 510;
    const maxHeight = 125;
    const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const logoWidth = logo.width * ratio;
    const logoHeight = logo.height * ratio;
    context.drawImage(logo, (canvas.width - logoWidth) / 2, 95, logoWidth, logoHeight);
  } catch {}

  context.fillStyle = purple;
  context.textAlign = 'center';
  context.font = '900 64px "Cheyenne Sans", sans-serif';
  context.fillText('MINHA COLINHA', 540, 320);

  let y = 390;
  order.forEach((key) => {
    const item = confirmed.get(key);
    context.textAlign = 'left';
    context.fillStyle = muted;
    context.font = '500 25px "Montserrat Local", sans-serif';
    context.fillText(item.role.toUpperCase(), 95, y);
    context.fillStyle = purple;
    context.font = '700 35px "Montserrat Local", sans-serif';
    context.fillText(item.name.toUpperCase(), 95, y + 45);
    context.textAlign = 'right';
    context.fillStyle = pink;
    context.font = '900 54px "Cheyenne Sans", sans-serif';
    context.fillText(item.number, 985, y + 38);
    context.strokeStyle = '#e8e2ee';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(95, y + 78);
    context.lineTo(985, y + 78);
    context.stroke();
    y += 170;
  });

  context.fillStyle = yellow;
  context.fillRect(38, 1410, 1004, 152);
  context.fillStyle = purple;
  context.textAlign = 'center';
  context.font = '500 34px "Montserrat Local", sans-serif';
  context.fillText('No dia da eleição, vote Tayane Mãe do Gui', 540, 1470);
  context.font = '700 37px "Montserrat Local", sans-serif';
  context.fillText('para Deputada Federal: 4511.', 540, 1520);

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('Não foi possível gerar a imagem.');
      return;
    }
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = 'minha-colinha-tayane-4511.png';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showToast('Colinha salva no dispositivo!');
  }, 'image/png');
}

document.querySelector('#download-ballot').addEventListener('click', downloadBallotImage);

const videoShareDialog = document.querySelector('#video-share-dialog');
const videoUrl = new URL('VIDEO/Thayane_mae_do_guivFULLHD3_legenda.mp4', location.href).href;
document.querySelector('#video-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(`Assista ao vídeo de Tayane Mãe do Gui — Deputada Federal 4511: ${videoUrl}`)}`;
document.querySelector('#share-video').addEventListener('click', () => {
  videoShareDialog.showModal();
  document.body.classList.add('dialog-open');
});
function closeVideoDialog() {
  videoShareDialog.close();
  document.body.classList.remove('dialog-open');
}
document.querySelector('.video-dialog-close').addEventListener('click', closeVideoDialog);
videoShareDialog.addEventListener('click', (event) => { if (event.target === videoShareDialog) closeVideoDialog(); });

document.querySelectorAll('.notice-button').forEach((button) => {
  button.addEventListener('click', () => showToast('Este conteúdo será disponibilizado em breve.'));
});

const campaignVideo = document.querySelector('#campaign-video');
const videoPreviewButton = document.querySelector('#video-preview-button');
const videoPreview = document.querySelector('#video-preview');
campaignVideo.addEventListener('loadedmetadata', () => {
  if (campaignVideo.currentTime === 0 && campaignVideo.duration > 1) {
    campaignVideo.currentTime = Math.min(67, campaignVideo.duration / 2);
  }
}, { once: true });
campaignVideo.addEventListener('seeked', () => {
  if (!campaignVideo.videoWidth || campaignVideo.currentTime < 5 || campaignVideo.dataset.previewReady) return;
  const canvas = document.createElement('canvas');
  canvas.width = campaignVideo.videoWidth;
  canvas.height = campaignVideo.videoHeight;
  canvas.getContext('2d').drawImage(campaignVideo, 0, 0, canvas.width, canvas.height);
  videoPreview.src = canvas.toDataURL('image/jpeg', .86);
  videoPreviewButton.classList.add('ready');
  campaignVideo.dataset.previewReady = 'true';
  campaignVideo.currentTime = 0;
});
videoPreviewButton.addEventListener('click', () => {
  videoPreviewButton.classList.remove('ready');
  campaignVideo.play().catch(() => {});
});
campaignVideo.addEventListener('play', () => videoPreviewButton.classList.remove('ready'));

const menuButton = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('#nav-links');
menuButton.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});
navLinks.addEventListener('click', (event) => {
  if (event.target.matches('a')) {
    navLinks.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: .12 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

updateBallotState();
