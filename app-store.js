const appGrid = document.getElementById('app-grid');
const detailCard = document.getElementById('detail-card');
const searchInput = document.getElementById('search');
const categorySelect = document.getElementById('category');
const countLabel = document.getElementById('count');
const installToast = document.getElementById('install-toast');
const logOutput = document.getElementById('log-output');
const closeInstallToast = document.getElementById('close-install-toast');

let apps = [];
let selectedAppId = null;
let toastTimer = null;

const repo = 'https://raw.githubusercontent.com/juliodelfino/container-apps/main';

async function loadApps() {
  try {
    const remoteResponse = await fetch(`${repo}/data/apps.json`);
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

function showConfigModal(app) {
  return new Promise((resolve) => {
    // Cria o overlay do modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(4px);
    `;

    // Cria o modal
    const modal = document.createElement('div');
    modal.className = 'config-modal';
    modal.style.cssText = `
      background: var(--panel-strong);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 32px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;

    // Cabeçalho do modal
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: var(--text);">Configurar ${app.name}</h2>
        <button class="modal-close" style="
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0 8px;
        ">✕</button>
      </div>
      <p style="color: var(--muted); margin-bottom: 24px;">
        Ajuste as variáveis de ambiente antes da instalação. Valores padrão serão usados se não forem alterados.
      </p>
      <div id="config-fields" style="display: flex; flex-direction: column; gap: 16px;">
        ${Object.entries(app.default_config || {}).map(([key, value]) => `
          <div class="config-field">
            <label for="config-${key}" style="
              display: block;
              margin-bottom: 4px;
              color: var(--text);
              font-weight: 500;
              font-size: 0.9rem;
            ">${key}</label>
            <input id="config-${key}" type="text" value="${value}" style="
              width: 100%;
              padding: 10px 14px;
              border-radius: 12px;
              border: 1px solid var(--border);
              background: rgba(255,255,255,0.05);
              color: var(--text);
              font-family: monospace;
              font-size: 0.9rem;
              transition: border-color 0.2s;
            ">
            <div style="
              font-size: 0.8rem;
              color: var(--muted);
              margin-top: 4px;
            ">Valor padrão: ${value}</div>
          </div>
        `).join('')}
      </div>
      <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
        <button class="btn btn--secondary modal-cancel" style="
          padding: 10px 24px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: transparent;
          color: var(--text);
          cursor: pointer;
        ">Cancelar</button>
        <button class="btn btn--primary modal-install" style="
          padding: 10px 24px;
          border-radius: 999px;
          background: var(--accent);
          color: #03211d;
          border: none;
          font-weight: 700;
          cursor: pointer;
        ">Instalar com estas configurações</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Fecha o modal ao clicar no overlay (mas não no modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });

    // Fecha o modal ao clicar no X
    modal.querySelector('.modal-close').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    // Fecha ao clicar em Cancelar
    modal.querySelector('.modal-cancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    // Confirma a instalação
    modal.querySelector('.modal-install').addEventListener('click', () => {
      // Coleta os valores dos campos
      const config = {};
      Object.keys(app.default_config || {}).forEach(key => {
        const input = document.getElementById(`config-${key}`);
        if (input) {
          config[key] = input.value.trim() || app.default_config[key];
        }
      });
      
      document.body.removeChild(overlay);
      resolve(config);
    });

    // Aplica foco no primeiro campo
    const firstInput = modal.querySelector('input');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  });
}

async function installApp(app) {
  // Mostra o modal de configuração
  const config = await showConfigModal(app);
  
  // Se o usuário cancelou, interrompe a instalação
  if (config === null) {
    const status = document.getElementById('install-status');
    status.textContent = '⏸️ Instalação cancelada pelo usuário.';
    status.style.color = '#ffd93d';
    return;
  }

  const status = document.getElementById('install-status');
  const installButton = detailCard.querySelector('.install-button');
  
  if (installButton) {
    installButton.disabled = true;
    installButton.textContent = 'Instalando...';
  }

  logOutput.textContent = '';
  status.textContent = '🚀 Iniciando instalação com configurações personalizadas...';
  showInstallToast();

  try {
    let cockpit = null;
    try {
      if (window.parent && window.parent.cockpit) {
        cockpit = window.parent.cockpit;
      } else if (window.cockpit && typeof window.cockpit.spawn === 'function') {
        cockpit = window.cockpit;
      } else {
        const script = document.createElement('script');
        script.src = '/cockpit/static/base1/cockpit.js';
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        if (window.cockpit && typeof window.cockpit.spawn === 'function') {
          cockpit = window.cockpit;
        }
      }
    } catch (e) {
      console.warn('Erro ao acessar Cockpit:', e);
    }

    if (cockpit) {
      const installDir = `/opt/container-apps/${app.id}`;

      // Cria as variáveis de ambiente para o script
      const envVars = Object.entries(config)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

      // Cria um script shell completo com as variáveis
      const script = `
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
set -e
APP_ID='${app.id}'
DEST_DIR="${installDir}"

echo "📁 Criando diretório: $DEST_DIR"
mkdir -p "$DEST_DIR"

echo "📥 Baixando arquivos do app ${app.name}..."
curl -fsSL "${repo}/apps/$APP_ID/metadata.yaml" -o "$DEST_DIR/metadata.yaml"
curl -fsSL "${repo}/apps/$APP_ID/docker-compose.yml" -o "$DEST_DIR/docker-compose.yml"
curl -fsSL "${repo}/apps/$APP_ID/config.yml" -o "$DEST_DIR/config.yml"

echo "📄 Arquivos baixados com sucesso!"
cd "$DEST_DIR"
echo "📋 Conteúdo do diretório:"
ls -la

echo "🔄 Substituindo variáveis no docker-compose.yml..."
${Object.entries(config).map(([key, value]) => 
  `sed -i 's/\${${key}:-[^}]*}/${value}/g' docker-compose.yml`
).join('\n')}

echo "🐳 Iniciando container com Docker Compose..."
${envVars} /usr/bin/docker compose up -d

echo "✅ Instalação concluída para $APP_ID"
echo "📍 Container instalado em: $DEST_DIR"
echo "📋 Configurações aplicadas:"
${Object.entries(config).map(([key, value]) => 
  `echo "  ${key}=${value}"`
).join('\n')}
`;

      status.textContent = '⏳ Executando comandos no servidor...';
      logOutput.textContent = `> Baixando arquivos do app ${app.name} do repositório remoto...\n`;
      logOutput.textContent += `> Configurações: ${JSON.stringify(config, null, 2)}\n\n`;

      try {
        const proc = await cockpit.script(script, {
          superuser: 'require',
          err: 'out'
        });

        const output = proc.trim() || '✅ Comando executado sem saída.';
        logOutput.textContent = output;
        status.textContent = '✅ Instalação concluída com sucesso!';
        status.style.color = 'var(--accent)';

      } catch (scriptError) {
        console.error('Erro no cockpit.script:', scriptError);
        throw scriptError;
      }
    }

  } catch (error) {
    console.error('Erro na instalação:', error);
    
    let errorMsg = error.message || 'Erro desconhecido';
    
    if (errorMsg.includes('not-found')) {
      errorMsg = 'Comando não encontrado. Verifique se o Docker está instalado.';
    } else if (errorMsg.includes('permission denied')) {
      errorMsg = 'Permissão negada. Execute como root ou verifique permissões.';
    } else if (errorMsg.includes('curl')) {
      errorMsg = 'Falha ao baixar arquivos. Verifique a conexão com o GitHub.';
    } else if (errorMsg.includes('docker')) {
      errorMsg = 'Erro ao executar Docker. Verifique se o Docker está instalado e rodando.';
    }
    
    logOutput.textContent += `\n❌ Erro: ${errorMsg}\n\nDetalhes técnicos:\n${error.stack || error}`;
    status.textContent = `❌ Falha ao instalar: ${errorMsg}`;
    status.style.color = '#ff6b6b';

  } finally {
    if (installButton) {
      installButton.disabled = false;
      installButton.textContent = 'Instalar no servidor';
    }
  }
}

function showInstallToast() {
  logOutput.textContent = '';
  installToast.hidden = false;

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    installToast.hidden = true;
  }, 10000);
}

function closeInstallToastHandler() {
  installToast.hidden = true;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
}

closeInstallToast.addEventListener('click', closeInstallToastHandler);

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
