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
  let catalog = [];

  try {
    const remoteResponse = await fetch(`${repo}/data/apps.json`);
    if (!remoteResponse.ok) {
      throw new Error('Remote catalog not available');
    }
    catalog = await remoteResponse.json();
  } catch (error) {
    const localResponse = await fetch('./data/apps.json');
    catalog = await localResponse.json();
  }

  apps = await Promise.all(
    catalog.map(async (placeholderApp) => {
      const appId = placeholderApp.id;

      try {
        const [metadataText, composeText, configText] = await Promise.all([
          fetchAppFile(appId, 'metadata.yml'),
          fetchAppFile(appId, 'docker-compose.yml'),
          fetchAppFile(appId, 'config.yml')
        ]);

        const metadata = parseMetadataYaml(metadataText);
        const configFields = parseYamlConfig(configText);

        return normalizeApp({
          ...placeholderApp,
          ...metadata,
          compose: composeText,
          config: configText,
          configFields: configFields.fields || [],
          configDescription: configFields.description || ''
        }, appId);
      } catch (error) {
        console.warn(`Não foi possível carregar o app ${appId}:`, error);
        return normalizeApp(placeholderApp, appId);
      }
    })
  );

  populateCategories();
  renderApps();
  if (apps.length) {
    selectApp(apps[0].id);
  }
}

// Garante que todos os campos usados na interface existam, independente do
// que veio do catálogo, do metadata.yml ou de uma falha de carregamento.
function normalizeApp(source, appId) {
  const app = source || {};
  const webUi = app.web_ui || {};
  const defaults = app.default_config;

  return {
    ...app,
    id: app.id || appId,
    name: app.name || appId,
    description: app.description || 'App disponível no repositório.',
    long_description: app.long_description || 'App sem descrição detalhada.',
    package_name: app.package_name || appId,
    version: app.version || 'latest',
    homepage: app.homepage || '#',
    category: app.category || 'tools',
    tags: Array.isArray(app.tags) ? app.tags : [],
    icon: app.icon || '📦',
    language: app.language || 'unknown',
    architecture: app.architecture || 'all',
    license: app.license || 'Não informada',
    maintainer: app.maintainer || 'Não informado',
    web_ui: {
      enabled: Boolean(webUi.enabled),
      path: webUi.path || '/',
      port: webUi.port || 0,
      protocol: webUi.protocol || 'http'
    },
    default_config: defaults && typeof defaults === 'object' ? defaults : {},
    configFields: Array.isArray(app.configFields) ? app.configFields : [],
    configDescription: app.configDescription || '',
    manifest: app.manifest || {
      metadata: `apps/${appId}/metadata.yml`,
      compose: `apps/${appId}/docker-compose.yml`,
      config: `apps/${appId}/config.yml`
    },
    compose: app.compose || '',
    config: app.config || ''
  };
}

async function fetchAppFile(appId, fileName) {
  const remotePath = `${repo}/apps/${appId}/${fileName}`;

  try {
    const response = await fetch(remotePath);
    if (!response.ok) {
      throw new Error(`Remote ${fileName} unavailable`);
    }
    return await response.text();
  } catch (error) {
    const localPath = `./apps/${appId}/${fileName}`;
    const localResponse = await fetch(localPath);
    if (!localResponse.ok) {
      throw new Error(`Local ${fileName} unavailable`);
    }
    return await localResponse.text();
  }
}

// Uma linha aninhada é indentada e não vazia; uma linha em coluna 0 inicia nova chave de topo.
function isNestedLine(rawLine) {
  return rawLine.trim() !== '' && /^\s/.test(rawLine);
}

// Remove aspas simples ou duplas que envolvem o valor (ex.: version: "8.4").
function unquote(value) {
  return String(value).replace(/^['"]|['"]$/g, '');
}

function parseMetadataYaml(text) {
  const app = {};
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    const value = keyMatch[2].trim();

    if (key === 'tags') {
      if (value && value !== '|' && value !== '>') {
        app.tags = value
          .split(/[\s,]+/)
          .map((tag) => tag.replace(/['"]/g, ''))
          .filter(Boolean);
      } else {
        const tags = [];
        i += 1;
        while (i < lines.length && lines[i].trim().startsWith('-')) {
          tags.push(lines[i].trim().replace(/^-\s*/, ''));
          i += 1;
        }
        i -= 1;
        app.tags = tags;
      }
    } else if (key === 'web_ui') {
      app.web_ui = { enabled: false, path: '/', port: 0, protocol: 'http' };
      i += 1;
      while (i < lines.length && isNestedLine(lines[i])) {
        const nestedLine = lines[i].trim();
        const nestedMatch = nestedLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!nestedMatch) {
          break;
        }
        const nestedKey = nestedMatch[1];
        const nestedValue = nestedMatch[2].trim();
        if (nestedKey === 'enabled') {
          app.web_ui.enabled = nestedValue === 'true';
        } else if (nestedKey === 'path') {
          app.web_ui.path = nestedValue;
        } else if (nestedKey === 'port') {
          app.web_ui.port = Number(nestedValue);
        } else if (nestedKey === 'protocol') {
          app.web_ui.protocol = nestedValue;
        }
        i += 1;
      }
      i -= 1;
    } else if (key === 'default_config') {
      const defaults = {};
      i += 1;
      while (i < lines.length && isNestedLine(lines[i])) {
        const nestedLine = lines[i].trim();
        const nestedMatch = nestedLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!nestedMatch) {
          break;
        }
        const nestedKey = nestedMatch[1];
        const nestedValue = nestedMatch[2].trim();
        defaults[nestedKey] = nestedValue.replace(/^['"]|['"]$/g, '');
        i += 1;
      }
      i -= 1;
      app.default_config = defaults;
    } else if (value === '|' || value === '>') {
      const blockLines = [];
      i += 1;
      while (i < lines.length) {
        const nextRaw = lines[i];
        const nextTrimmed = nextRaw.trim();
        if (!nextTrimmed) {
          blockLines.push('');
          i += 1;
          continue;
        }

        const nextIndent = nextRaw.match(/^\s*/)[0].length;
        if (nextIndent === 0 && nextTrimmed.match(/^[A-Za-z0-9_]+:/)) {
          break;
        }

        blockLines.push(nextTrimmed);
        i += 1;
      }
      i -= 1;
      app[key] = blockLines.join('\n').trim();
    } else if (key === 'name') {
      app.name = unquote(value);
    } else if (key === 'description') {
      app.description = unquote(value);
    } else if (key === 'long_description') {
      app.long_description = unquote(value);
    } else if (key === 'homepage') {
      app.homepage = unquote(value);
    } else if (key === 'package_name') {
      app.package_name = unquote(value);
    } else if (key === 'version') {
      app.version = unquote(value);
    } else if (key === 'upstream_version') {
      app.upstream_version = unquote(value);
    } else if (key === 'maintainer') {
      app.maintainer = unquote(value);
    } else if (key === 'license') {
      app.license = unquote(value);
    } else if (key === 'debian_section') {
      app.debian_section = unquote(value);
    } else if (key === 'architecture') {
      app.architecture = unquote(value);
    } else {
      app[key] = value;
    }
  }

  return app;
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
    const haystack = `${app.name} ${app.description} ${app.category} ${(app.tags || []).join(' ')}`.toLowerCase();
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
  const webUi = app.web_ui || {};
  const manifest = app.manifest || {};
  const defaultConfig = app.default_config || {};
  const configEntries = Object.entries(defaultConfig);

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
            <li>Habilitada: ${webUi.enabled ? 'Sim' : 'Não'}</li>
            <li>Caminho: ${webUi.path || '/'}</li>
            <li>Porta: ${webUi.port || 0}</li>
            <li>Protocolo: ${webUi.protocol || 'http'}</li>
          </ul>
        </article>
        <article>
          <h4>Manifestos</h4>
          <ul>
            <li><strong>Metadata:</strong> ${manifest.metadata || '—'}</li>
            <li><strong>Compose:</strong> ${manifest.compose || '—'}</li>
            <li><strong>Config:</strong> ${manifest.config || '—'}</li>
          </ul>
        </article>
      </div>

      <article>
        <h4>Configuração padrão</h4>
        <ul>
          ${configEntries.length
            ? configEntries
                .map(([key, value]) => `<li><strong>${key}</strong>: ${value}</li>`)
                .join('')
            : '<li>Nenhuma variável padrão definida.</li>'}
        </ul>
      </article>
    </div>
  `;

  detailCard.querySelector('.install-button').addEventListener('click', () => installApp(app));
}

async function showConfigModal(app) {
  return new Promise(async (resolve) => {
    let fields = Array.isArray(app.configFields) ? app.configFields : [];
    let groupDescription = app.configDescription || '';

    if (fields.length === 0 && app.default_config) {
      fields = Object.keys(app.default_config).map(key => ({
        id: key,
        type: 'string',
        default: app.default_config[key],
        required: true,
        label: key
      }));
    }

    // Se ainda assim não tiver campos, mostra mensagem de erro
    if (fields.length === 0) {
      fields = Object.keys(app.default_config || {}).map(key => ({
        id: key,
        type: 'string',
        default: app.default_config[key],
        required: true,
        label: key
      }));
      
      if (fields.length === 0) {
        // Se não tem nenhum campo, mostra mensagem
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
        
        const modal = document.createElement('div');
        modal.style.cssText = `
          background: var(--panel-strong);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 32px;
          max-width: 500px;
          text-align: center;
        `;
        modal.innerHTML = `
          <h3 style="color: var(--text);">Nenhuma configuração disponível</h3>
          <p style="color: var(--muted);">Este app não possui variáveis configuráveis.</p>
          <button class="btn btn--primary" style="margin-top: 20px; padding: 10px 24px; border-radius: 999px; background: var(--accent); color: #03211d; border: none; font-weight: 700; cursor: pointer;">Instalar com padrões</button>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        modal.querySelector('button').addEventListener('click', () => {
          document.body.removeChild(overlay);
          resolve(app.default_config || {});
        });
        
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            document.body.removeChild(overlay);
            resolve(null);
          }
        });
        return;
      }
    }

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
      max-width: 650px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;

    // Cabeçalho do modal
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="margin: 0; color: var(--text);">Configurar ${app.name}</h2>
          ${groupDescription ? 
            `<p style="margin: 4px 0 0; color: var(--muted); font-size: 0.9rem;">${groupDescription}</p>` : 
            `<p style="margin: 4px 0 0; color: var(--muted); font-size: 0.9rem;">Configurações do aplicativo</p>`}
        </div>
        <button class="modal-close" style="
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0 8px;
          transition: color 0.2s;
        ">✕</button>
      </div>
      <p style="color: var(--muted); margin-bottom: 24px; font-size: 0.95rem;">
        Ajuste as variáveis de ambiente antes da instalação. Valores padrão serão usados se não forem alterados.
      </p>
      <div id="config-fields" style="display: flex; flex-direction: column; gap: 16px;">
        ${fields.map(field => `
          <div class="config-field" style="
            padding: 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            border: 1px solid var(--border);
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label for="config-${field.id}" style="
                color: var(--text);
                font-weight: 500;
                font-size: 0.9rem;
              ">${field.label || field.id}</label>
              ${field.required ? 
                `<span style="color: #ff6b6b; font-size: 0.8rem;">*obrigatório</span>` : 
                `<span style="color: var(--muted); font-size: 0.8rem;">opcional</span>`}
            </div>
            ${field.type === 'enum' ? `
              <select id="config-${field.id}" style="
                width: 100%;
                padding: 10px 14px;
                border-radius: 12px;
                border: 1px solid var(--border);
                background: rgba(255,255,255,0.05);
                color: var(--text);
                font-size: 0.9rem;
                transition: border-color 0.2s;
              ">
                ${(field.options || []).map(opt => `
                  <option value="${opt}" ${opt === field.default ? 'selected' : ''}>${opt}</option>
                `).join('')}
              </select>
            ` : `
              <input id="config-${field.id}" type="${field.type === 'integer' ? 'number' : 'text'}" 
                value="${field.default || ''}" 
                ${field.type === 'integer' ? `min="${field.min || 1}" max="${field.max || 65535}"` : ''}
                style="
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
            `}
            <div style="
              font-size: 0.8rem;
              color: var(--muted);
              margin-top: 4px;
            ">Valor padrão: ${field.default || 'não definido'}</div>
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
          transition: all 0.2s;
        ">Cancelar</button>
        <button class="btn btn--primary modal-install" style="
          padding: 10px 24px;
          border-radius: 999px;
          background: var(--accent);
          color: #03211d;
          border: none;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        ">Instalar com estas configurações</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Função para fechar o modal
    function closeModal() {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      resolve(null);
    }

    // Fecha o modal ao clicar no overlay (mas não no modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Fecha o modal ao clicar no X
    modal.querySelector('.modal-close').addEventListener('click', closeModal);

    // Fecha ao clicar em Cancelar
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);

    // Confirma a instalação
    modal.querySelector('.modal-install').addEventListener('click', () => {
      // Coleta os valores dos campos
      const config = {};
      fields.forEach(field => {
        const input = document.getElementById(`config-${field.id}`);
        if (input) {
          const value = input.value.trim();
          config[field.id] = value || field.default || '';
        }
      });
      
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      resolve(config);
    });

    // Aplica foco no primeiro campo
    const firstInput = modal.querySelector('input, select');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  });
}

// Função de parse YAML
function parseYamlConfig(yamlText) {
  const result = { fields: [], description: '' };
  const lines = yamlText.split('\n');
  let currentField = null;
  let inFields = false;
  let inGroup = false;
  let groupDescription = '';
  let fieldIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)[0].length;
    
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detecta início do grupo
    if (trimmed.startsWith('groups:')) {
      inGroup = true;
      continue;
    }

    // Detecta propriedades do grupo (antes de fields)
    if (inGroup && !inFields) {
      if (trimmed.startsWith('label:')) {
        const match = trimmed.match(/label:\s*(.+)/);
        if (match) groupDescription = match[1].trim();
      } else if (trimmed.startsWith('description:')) {
        const match = trimmed.match(/description:\s*(.+)/);
        if (match) groupDescription = match[1].trim();
      } else if (trimmed === 'fields:') {
        inFields = true;
        if (groupDescription) {
          result.description = groupDescription;
        }
        continue;
      }
      continue;
    }

    // Dentro de fields, detecta início de um field
    if (inFields && trimmed.startsWith('- id:')) {
      // Se havia um field anterior, adiciona ele
      if (currentField) {
        result.fields.push(currentField);
        currentField = null;
      }
      currentField = {};
      const match = trimmed.match(/id:\s*(.+)/);
      if (match) currentField.id = match[1].trim();
      fieldIndent = indent;
      continue;
    }

    // Propriedades do field atual
    if (currentField && inFields) {
      // Se a indentação é maior que a do field, é propriedade dele
      if (indent > fieldIndent) {
        if (trimmed.startsWith('label:')) {
          const match = trimmed.match(/label:\s*(.+)/);
          if (match) currentField.label = match[1].trim();
        } else if (trimmed.startsWith('type:')) {
          const match = trimmed.match(/type:\s*(.+)/);
          if (match) currentField.type = match[1].trim();
        } else if (trimmed.startsWith('default:')) {
          const match = trimmed.match(/default:\s*(.+)/);
          if (match) {
            let value = match[1].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
              value = value.slice(1, -1);
            }
            currentField.default = value;
          }
        } else if (trimmed.startsWith('required:')) {
          const match = trimmed.match(/required:\s*(.+)/);
          if (match) currentField.required = match[1].trim() === 'true';
        } else if (trimmed.startsWith('min:')) {
          const match = trimmed.match(/min:\s*(.+)/);
          if (match) currentField.min = parseInt(match[1].trim());
        } else if (trimmed.startsWith('max:')) {
          const match = trimmed.match(/max:\s*(.+)/);
          if (match) currentField.max = parseInt(match[1].trim());
        } else if (trimmed.startsWith('options:')) {
          const match = trimmed.match(/options:\s*\[(.*)\]/);
          if (match) {
            currentField.options = match[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
          }
        }
      } else {
        // Se a indentação é menor ou igual, saiu do field
        result.fields.push(currentField);
        currentField = null;
      }
    }
  }

  // Adiciona o último field se existir
  if (currentField) {
    result.fields.push(currentField);
  }

  return result;
}

// Gera as linhas do arquivo .env usando aspas simples, para preservar espaços e
// aspas duplas em valores como o COMMAND do dockur/windows.
function envFileLines(config, suffix = ' >> .env') {
  return Object.entries(config).map(([key, value]) => {
    const safeValue = String(value).replace(/'/g, "'\\''");
    return `echo '${key}=${safeValue}'${suffix}`;
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

      // Pega o profile do APP_PROFILE
      const profile = config.APP_PROFILE || null;
      // Remove o APP_PROFILE do objeto config para não duplicar no .env
      const cleanConfig = { ...config };
      delete cleanConfig.APP_PROFILE;

      // Só adiciona --profile se um perfil foi definido
      const profileArg = profile ? `--profile ${profile}` : '';

      // Log do que está sendo executado
      logOutput.textContent = `> Baixando arquivos do app ${app.name} do repositório remoto...\n`;
      if (profile) {
        logOutput.textContent += `> Perfil selecionado: ${profile}\n`;
      } else {
        logOutput.textContent += `> Nenhum perfil selecionado (usando todos os serviços)\n`;
      }
      logOutput.textContent += `> Configurações: ${JSON.stringify(cleanConfig, null, 2)}\n\n`;

      // Cria um script shell completo com as variáveis
      const script = `
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
set -e
APP_ID='${app.id}'
DEST_DIR="${installDir}"
${profile ? `PROFILE="${profile}"` : ''}

echo "📁 Criando diretório: $DEST_DIR"
mkdir -p "$DEST_DIR"

echo "📥 Baixando arquivos do app ${app.name}..."
curl -fsSL "${repo}/apps/$APP_ID/metadata.yml" -o "$DEST_DIR/metadata.yml"
curl -fsSL "${repo}/apps/$APP_ID/docker-compose.yml" -o "$DEST_DIR/docker-compose.yml"
curl -fsSL "${repo}/apps/$APP_ID/config.yml" -o "$DEST_DIR/config.yml"

echo "📄 Arquivos baixados com sucesso!"
cd "$DEST_DIR"

echo "🔄 Gerando arquivo .env com as configurações..."
${envFileLines(cleanConfig).join('\n')}
${profile ? `echo "APP_PROFILE=${profile}" >> .env` : ''}

echo "📋 Arquivo .env criado!"

echo "🐳 Iniciando container com Docker Compose..."
/usr/bin/docker compose --env-file .env ${profileArg} up -d

echo "✅ Instalação concluída para $APP_ID´${profile ? ' ('+profile+')' : ''}´"
echo "📍 Container instalado em: $DEST_DIR"
`;

      status.textContent = '⏳ Executando comandos no servidor...';

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
        logOutput.textContent += `\n❌ Erro detalhado:\n${JSON.stringify(scriptError, null, 2)}\n`;
        throw scriptError;
      }
    } else {
      // Fallback para quando não está no Cockpit
      const profile = config.APP_PROFILE || null;
      const cleanConfig = { ...config };
      delete cleanConfig.APP_PROFILE;
      const profileArg = profile ? ` --profile ${profile}` : '';

      const fallbackMsg = `⚠️ Cockpit não está disponível. Execute manualmente:\n\n` +
        `mkdir -p /opt/container-apps/${app.id} && \\\n` +
        `cd /opt/container-apps/${app.id} && \\\n` +
        `curl -fsSL ${repo}/apps/${app.id}/metadata.yml -o metadata.yml && \\\n` +
        `curl -fsSL ${repo}/apps/${app.id}/docker-compose.yml -o docker-compose.yml && \\\n` +
        `curl -fsSL ${repo}/apps/${app.id}/config.yml -o config.yml && \\\n` +
        `${envFileLines(cleanConfig, ' >> .env && \\\n').join('')}` +
        `${profile ? `echo "APP_PROFILE=${profile}" >> .env && \\\n` : ''}` +
        `docker compose --env-file .env${profileArg} up -d`;
      
      logOutput.textContent = fallbackMsg;
      status.textContent = '⚠️ Cockpit não disponível. Comando manual gerado.';
      status.style.color = '#ffd93d';
    }

  } catch (error) {
    console.error('Erro na instalação:', error);
    
    let errorMsg = 'Erro desconhecido';
    let errorDetails = '';
    
    if (error && typeof error === 'object') {
      if (error.problem) {
        errorMsg = error.problem;
        if (error.exit_status !== undefined && error.exit_status !== null) {
          errorDetails += `Código de saída: ${error.exit_status}\n`;
        }
        if (error.exit_signal) {
          errorDetails += `Sinal: ${error.exit_signal}\n`;
        }
      } else if (error.message) {
        errorMsg = error.message;
      } else if (typeof error === 'string') {
        errorMsg = error;
      }
    }

    const errorMap = {
      'not-found': 'Comando não encontrado. Verifique se o Docker está instalado e no PATH.',
      'permission denied': 'Permissão negada. Execute como root ou verifique permissões.',
      'curl': 'Falha ao baixar arquivos. Verifique a conexão com o GitHub.',
      'docker': 'Erro ao executar Docker. Verifique se o Docker está instalado e rodando.',
      'ENOENT': 'Arquivo ou diretório não encontrado.',
      'EACCES': 'Permissão negada para acessar o arquivo/diretório.',
      'no such file': 'Arquivo não encontrado. Verifique o caminho.',
    };

    for (const [key, value] of Object.entries(errorMap)) {
      if (errorMsg.toLowerCase().includes(key.toLowerCase())) {
        errorMsg = value;
        break;
      }
    }

    if (error.problem === 'authentication-failed') {
      errorMsg = 'Falha de autenticação. Verifique suas credenciais.';
    } else if (error.problem === 'access-denied') {
      errorMsg = 'Acesso negado. Você não tem permissão para executar este comando.';
    }

    logOutput.textContent += `\n❌ Erro: ${errorMsg}\n\n`;
    
    if (errorDetails) {
      logOutput.textContent += `Detalhes:\n${errorDetails}`;
    }
    
    if (error.stack) {
      logOutput.textContent += `\nStack trace:\n${error.stack}`;
    } else if (error.toString && error.toString() !== '[object Object]') {
      logOutput.textContent += `\nDetalhes: ${error.toString()}`;
    }
    
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
  if (!category) return '';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

searchInput.addEventListener('input', renderApps);
categorySelect.addEventListener('change', renderApps);

loadApps();
