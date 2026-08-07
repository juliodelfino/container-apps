const appGrid = document.getElementById('app-grid');
const detailCard = document.getElementById('detail-card');
const searchInput = document.getElementById('search');
const categorySelect = document.getElementById('category');
const countLabel = document.getElementById('count');

let apps = [];
let selectedAppId = null;

async function loadApps() {
  try {
    const remoteResponse = await fetch('https://raw.githubusercontent.com/juliodelfino/container-apps/main/data/apps.json');
    if (!remoteResponse.ok) {
      throw new Error('Remote catalog not available');
    }
    apps = await remoteResponse.json();
  } catch (error) {
    const localResponse = await fetch('./data/apps.json');
    apps = await localResponse.json();
  }

  populateCategories();
  renderApps();
  if (apps.length) {
    selectApp(apps[0].id);
  }
}

function populateCategories() {
  const categories = [...new Set(apps.map((app) => app.category))].sort();
  categorySelect.innerHTML = '<option value="all">Todas</option>';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = categoryLabel(category);
    categorySelect.appendChild(option);
  });
}

function renderApps() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categorySelect.value;

  const filtered = apps.filter((app) => {
    const matchesCategory = category === 'all' || app.category === category;
    const haystack = `${app.name} ${app.description} ${app.category} ${app.tags.join(' ')}`.toLowerCase();
    const matchesQuery = haystack.includes(query);
    return matchesCategory && matchesQuery;
  });

  countLabel.textContent = `${filtered.length} app${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    appGrid.innerHTML = '<p class="detail-card__placeholder">Nenhum app encontrado.</p>';
    return;
  }

  appGrid.innerHTML = filtered
    .map((app) => {
      const selectedClass = app.id === selectedAppId ? ' is-selected' : '';
      return `
        <article class="app-card${selectedClass}" data-id="${app.id}">
          <div class="app-card__top">
            <span class="app-card__icon">${app.icon}</span>
            <span class="badge">${categoryLabel(app.category)}</span>
          </div>
          <h3>${app.name}</h3>
          <p>${app.description}</p>
          <div class="app-card__meta">
            <span>${app.package_name}</span>
            <span>v${app.version}</span>
          </div>
        </article>
      `;
    })
    .join('');

  appGrid.querySelectorAll('.app-card').forEach((card) => {
    card.addEventListener('click', () => selectApp(card.dataset.id));
  });
}

function selectApp(id) {
  const app = apps.find((item) => item.id === id);
  if (!app) return;

  selectedAppId = id;
  renderApps();
  renderDetail(app);
}

function renderDetail(app) {
  detailCard.innerHTML = `
    <div class="detail-card__content">
      <div class="detail-card__header">
        <div>
          <p class="eyebrow">${categoryLabel(app.category)}</p>
          <h3>${app.name}</h3>
        </div>
        <div class="detail-card__actions">
          <a class="btn btn--secondary" href="${app.homepage}" target="_blank" rel="noreferrer">Abrir homepage</a>
          <button class="btn btn--primary install-button" data-app-id="${app.id}">Instalar no servidor</button>
        </div>
      </div>

      <p>${app.long_description}</p>
      <div id="install-status" class="install-status">O addon irá copiar os arquivos do app e tentar iniciar o container via Docker Compose.</div>

      <div class="detail-grid">
        <article>
          <h4>Empacotamento</h4>
          <ul>
            <li>Pacote: ${app.package_name}</li>
            <li>Versão: ${app.version}</li>
            <li>Arquitetura: ${app.architecture}</li>
            <li>Licença: ${app.license}</li>
          </ul>
        </article>
        <article>
          <h4>Interface web</h4>
          <ul>
            <li>Habilitada: ${app.web_ui.enabled ? 'Sim' : 'Não'}</li>
            <li>Caminho: ${app.web_ui.path}</li>
            <li>Porta: ${app.web_ui.port}</li>
            <li>Protocolo: ${app.web_ui.protocol}</li>
          </ul>
        </article>
        <article>
          <h4>Manifestos</h4>
          <ul>
            <li><strong>Metadata:</strong> ${app.manifest.metadata}</li>
            <li><strong>Compose:</strong> ${app.manifest.compose}</li>
            <li><strong>Config:</strong> ${app.manifest.config}</li>
          </ul>
        </article>
      </div>

      <article>
        <h4>Configuração padrão</h4>
        <ul>
          ${Object.entries(app.default_config)
            .map(([key, value]) => `<li><strong>${key}</strong>: ${value}</li>`)
            .join('')}
        </ul>
      </article>
    </div>
  `;

  detailCard.querySelector('.install-button').addEventListener('click', () => installApp(app));
}

async function installApp(app) {
  const status = document.getElementById('install-status');
  const installButton = detailCard.querySelector('.install-button');

  if (installButton) {
    installButton.disabled = true;
    installButton.textContent = 'Instalando...';
  }

  status.textContent = 'Iniciando instalação no servidor...';

  try {
    if (window.cockpit && typeof window.cockpit.spawn === 'function') {
      const output = await window.cockpit.spawn(['/bin/bash', './scripts/install-app.sh', app.id], { superuser: 'try' });
      status.textContent = output.trim() || 'Instalação enviada ao servidor.';
    } else {
      status.textContent = 'Cockpit não está disponível nesta janela. Instale o addon no servidor para usar a instalação automática.';
    }
  } catch (error) {
    status.textContent = `Falha ao instalar: ${error.message || error}`;
  } finally {
    if (installButton) {
      installButton.disabled = false;
      installButton.textContent = 'Instalar no servidor';
    }
  }
}

function categoryLabel(category) {
  const map = {
    network: 'Rede',
    monitoring: 'Monitoramento',
    productivity: 'Produtividade',
    media: 'Mídia',
    tools: 'Ferramentas',
  };
  return map[category] || category;
}

searchInput.addEventListener('input', renderApps);
categorySelect.addEventListener('change', renderApps);

loadApps();
