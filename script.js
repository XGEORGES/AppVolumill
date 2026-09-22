// --- INICIO LOCAL DE LA APLICACIÓN ---

document.addEventListener('DOMContentLoaded', function () {
    const appContent = document.getElementById('app-content');
    if (appContent) {
        appContent.style.display = 'block';
    }

    // Inicializar detector de red (online / offline)
    initNetworkStatusWatcher();

    // Registrar y gestionar el Service Worker para soporte PWA, Offline y Actualizaciones
    initServiceWorker();

    // Inicializar configuraciones guardadas
    initSettings();
});

// --- MONITOREO DE CONEXIÓN A INTERNET ---
function initNetworkStatusWatcher() {
    const statusElem = document.getElementById('network-status');
    const statusText = document.getElementById('network-status-text');

    function updateStatus() {
        const isOnline = navigator.onLine;
        if (!statusElem || !statusText) return;

        if (isOnline) {
            statusElem.className = 'network-status-badge online';
            statusText.textContent = 'En línea (Nube sincronizada)';
        } else {
            statusElem.className = 'network-status-badge offline';
            statusText.textContent = 'Modo Local (Sin internet)';
        }
    }

    window.addEventListener('online', () => {
        updateStatus();
        showToastNotification('Conexión reestablecida. Verificando actualizaciones...');
        // Si vuelve el internet, verificar de inmediato si hay una nueva versión del Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => reg.update());
        }
    });

    window.addEventListener('offline', () => {
        updateStatus();
        showToastNotification('Sin internet. Trabajando con la versión guardada en disco.');
    });

    // Estado inicial
    updateStatus();
}

// --- GESTIÓN DE SERVICE WORKER & ACTUALIZACIONES AUTOMÁTICAS ---
function initServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('[App] Service Worker no es soportado en este navegador.');
        return;
    }

    let refreshing = false;
    // Recargar limpiamente cuando el nuevo worker tome el control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });

    // El SW ya fue registrado por el script inline en <head>.
    // Aquí solo obtenemos la referencia para gestionar actualizaciones.
    navigator.serviceWorker.ready
        .then((registration) => {
            console.log('[App] Service Worker activo y controlando:', registration.scope);

            // Verificación de salud para asegurar que no esté pegado
            checkServiceWorkerHealth();

            // 1. Si ya hay una nueva versión en espera de activarse
            if (registration.waiting) {
                notifyUserOfUpdate(registration.waiting);
            }

            // 2. Escuchar si se encuentra una nueva versión instalándose
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        notifyUserOfUpdate(newWorker);
                    }
                });
            });

            // 3. Comprobar actualizaciones en segundo plano si hay red
            if (navigator.onLine) {
                registration.update().catch(() => {
                    // Silencioso si la red no responde de inmediato
                });
            }
        })
        .catch((error) => {
            console.warn('[App] Aviso con Service Worker:', error);
        });
}

function checkServiceWorkerHealth() {
    if (!navigator.serviceWorker.controller) return;

    try {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.status === 'active') {
                console.log('[App] Motor Service Worker activo y respondiendo:', event.data.version);
            }
        };
        navigator.serviceWorker.controller.postMessage({ action: 'ping' }, [messageChannel.port2]);
    } catch (e) {
        console.warn('[App] Ping al Service Worker no enviado:', e);
    }
}

function notifyUserOfUpdate(worker) {
    showToastNotification(
        '¡Nueva versión disponible!',
        'Actualizar',
        () => {
            if (worker) {
                worker.postMessage({ action: 'skipWaiting' });
            }
            setTimeout(() => {
                window.location.reload();
            }, 300);
        }
    );
}

// --- NOTIFICACIONES FLOTANTES (TOAST) ---
function showToastNotification(message, buttonText = null, onButtonClick = null) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }

    toast.innerHTML = `<span>${message}</span>`;
    if (buttonText && onButtonClick) {
        const btn = document.createElement('button');
        btn.textContent = buttonText;
        btn.onclick = () => {
            onButtonClick();
            toast.classList.remove('show');
        };
        toast.appendChild(btn);
    }

    toast.classList.add('show');

    // Auto ocultar a los 5 segundos si no es un botón de acción crítica
    if (!buttonText) {
        setTimeout(() => {
            toast.classList.remove('show');
        }, 5000);
    }
}

// --- CONTROLES DE CONFIGURACIÓN GENERAL (MODAL & TOGGLES) ---
function toggleSettingsModal() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('active');
}

function closeSettingsModalOnOutsideClick(event) {
    const modal = document.getElementById('settings-modal');
    if (event.target === modal) {
        modal.classList.remove('active');
    }
}

// Inicializar configuraciones al cargar la página
function initSettings() {
    // 1. Tema
    const savedTheme = localStorage.getItem('cnc-theme') || 'dark';
    const themeToggle = document.getElementById('toggle-theme');
    const themeStatus = document.getElementById('theme-status');
    
    if (savedTheme === 'light') {
        document.body.classList.add('theme-light');
        if (themeToggle) themeToggle.checked = true;
        if (themeStatus) themeStatus.textContent = 'Claro';
    } else {
        document.body.classList.remove('theme-light');
        if (themeToggle) themeToggle.checked = false;
        if (themeStatus) themeStatus.textContent = 'Oscuro';
    }

    // 2. Unidades
    const savedUnit = localStorage.getItem('cnc-unit') || 'metric';
    const unitToggle = document.getElementById('toggle-units');
    const unitsStatus = document.getElementById('units-status');

    if (savedUnit === 'imperial') {
        if (unitToggle) unitToggle.checked = true;
        if (unitsStatus) unitsStatus.textContent = 'Pulgadas';
        setUnitVolumill('imperial', true);
        setUnitMrr('imperial', true);
        setUnitCircular('imperial', true);
    } else {
        if (unitToggle) unitToggle.checked = false;
        if (unitsStatus) unitsStatus.textContent = 'Métrico';
        setUnitVolumill('metric', true);
        setUnitMrr('metric', true);
        setUnitCircular('metric', true);
    }
}

// Manejador del toggle de Unidades
function handleUnitToggle(elem) {
    const statusText = document.getElementById('units-status');
    const targetUnit = elem.checked? 'imperial' : 'metric';
    
    statusText.textContent = elem.checked? 'Pulgadas' : 'Métrico';
    
    setUnitVolumill(targetUnit, false);
    setUnitMrr(targetUnit, false);
    setUnitCircular(targetUnit, false);
    
    localStorage.setItem('cnc-unit', targetUnit);
}

// Manejador del toggle de Tema
function handleThemeToggle(elem) {
    const statusText = document.getElementById('theme-status');
    
    if (elem.checked) {
        document.body.classList.add('theme-light');
        statusText.textContent = 'Claro';
        localStorage.setItem('cnc-theme', 'light');
    } else {
        document.body.classList.remove('theme-light');
        statusText.textContent = 'Oscuro';
        localStorage.setItem('cnc-theme', 'dark');
    }
}

// --- LÓGICA DE LA CALCULADORA Y PESTAÑAS ---
function switchPageTab(tabName) {
    document.getElementById('tab-volumill').classList.toggle('active', tabName === 'volumill');
    document.getElementById('tab-mrr').classList.toggle('active', tabName === 'mrr');
    document.getElementById('tab-circular').classList.toggle('active', tabName === 'circular');

    document.getElementById('tab-btn-volumill').classList.toggle('active', tabName === 'volumill');
    document.getElementById('tab-btn-mrr').classList.toggle('active', tabName === 'mrr');
    document.getElementById('tab-btn-circular').classList.toggle('active', tabName === 'circular');
}

let unitV = 'metric';
let lockedSpeedV = null;
let lockedFeedV = null;

function enableSpeedInput(target) {
    if (target === 'rpm' && lockedSpeedV === 'vc') {
        unlockSpeedV();
    } else if (target === 'vc' && lockedSpeedV === 'rpm') {
        unlockSpeedV();
    }
}

function enableFeedInput(target) {
    if (target === 'fz' && lockedFeedV === 'vf') {
        unlockFeedV();
    } else if (target === 'vf' && lockedFeedV === 'fz') {
        unlockFeedV();
    }
}

function handleFlutesInputV() {
    const flutes = parseFloat(document.getElementById('flutes').value);
    const rpm = parseFloat(document.getElementById('rpm').value);
    const fzInput = document.getElementById('fz');
    const vfInput = document.getElementById('vf');

    if (flutes > 0 && rpm > 0) {
        if (lockedFeedV === 'fz' && fzInput.value!== '') {
            const fz = parseFloat(fzInput.value);

            if (fz > 0) {
                vfInput.value = (fz * flutes * rpm).toFixed(3);
            }
        } else if (lockedFeedV === 'vf' && vfInput.value!== '') {
            const vf = parseFloat(vfInput.value);

            if (vf > 0) {
                fzInput.value = (vf / (flutes * rpm)).toFixed(3);
            }
        }
    }

    calculateVolumill();
}

function setUnitVolumill(targetUnit, force = false) {
    if (unitV === targetUnit &&!force) return;
    
    unitV = targetUnit;

    document.getElementById('unit-dia-v').textContent = targetUnit === 'metric'? 'mm' : 'pulg';
    document.getElementById('unit-vc-v').textContent = targetUnit === 'metric'? 'm/min' : 'SFM';
    document.getElementById('unit-fz-v').textContent = targetUnit === 'metric'? 'mm/f' : 'in/f';
    document.getElementById('unit-vf-v').textContent = targetUnit === 'metric'? 'mm/min' : 'in/min';

    const diaEl = document.getElementById('dia');
    const vcEl = document.getElementById('vc');
    const fzEl = document.getElementById('fz');
    const vfEl = document.getElementById('vf');

    if (!force) {
        if (diaEl.value!== '') {
            const val = parseFloat(diaEl.value);
            diaEl.value = targetUnit === 'imperial'? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }

        if (vcEl.value!== '') {
            const val = parseFloat(vcEl.value);
            vcEl.value = targetUnit === 'imperial'? (val * 3.28084).toFixed(3) : (val / 3.28084).toFixed(3);
        }

        if (fzEl.value!== '') {
            const val = parseFloat(fzEl.value);
            fzEl.value = targetUnit === 'imperial'? (val / 25.4).toFixed(4) : (val * 25.4).toFixed(3);
        }

        if (vfEl.value!== '') {
            const val = parseFloat(vfEl.value);
            vfEl.value = targetUnit === 'imperial'? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }
    }

    calculateVolumill();
}

function handleRpmInputV() {
    const rpmInput = document.getElementById('rpm');
    const vcInput = document.getElementById('vc');
    const dia = parseFloat(document.getElementById('dia').value);

    if (rpmInput.value!== '' &&!rpmInput.classList.contains('locked')) {
        lockedSpeedV = 'rpm';
        vcInput.classList.add('locked');
        vcInput.readOnly = true;

        if (dia > 0 && parseFloat(rpmInput.value) > 0) {
            const rpm = parseFloat(rpmInput.value);
            const vc = unitV === 'metric'? (Math.PI * dia * rpm) / 1000 : (Math.PI * dia * rpm) / 12;
            vcInput.value = vc.toFixed(3);
        } else vcInput.value = '';
    } else if (rpmInput.value === '' && lockedSpeedV === 'rpm') unlockSpeedV();
    calculateVolumill();
}

function handleVcInputV() {
    const rpmInput = document.getElementById('rpm');
    const vcInput = document.getElementById('vc');
    const dia = parseFloat(document.getElementById('dia').value);

    if (vcInput.value!== '' &&!vcInput.classList.contains('locked')) {
        lockedSpeedV = 'vc';
        rpmInput.classList.add('locked');
        rpmInput.readOnly = true;

        if (dia > 0 && parseFloat(vcInput.value) > 0) {
            const vc = parseFloat(vcInput.value);
            const rpm = unitV === 'metric'? (vc * 1000) / (Math.PI * dia) : (vc * 12) / (Math.PI * dia);
            rpmInput.value = rpm.toFixed(3);
        } else rpmInput.value = '';
    } else if (vcInput.value === '' && lockedSpeedV === 'vc') unlockSpeedV();
    calculateVolumill();
}

function handleFzInputV() {
    const fzInput = document.getElementById('fz');
    const vfInput = document.getElementById('vf');
    const flutes = parseFloat(document.getElementById('flutes').value);
    const rpm = parseFloat(document.getElementById('rpm').value);

    if (fzInput.value!== '' &&!fzInput.classList.contains('locked')) {
        lockedFeedV = 'fz';
        vfInput.classList.add('locked');
        vfInput.readOnly = true;

        if (flutes > 0 && rpm > 0 && parseFloat(fzInput.value) > 0) {
            const fz = parseFloat(fzInput.value);
            const vf = fz * flutes * rpm;
            vfInput.value = vf.toFixed(3);
        } else vfInput.value = '';
    } else if (fzInput.value === '' && lockedFeedV === 'fz') unlockFeedV();
    calculateVolumill();
}

function handleVfInputV() {
    const fzInput = document.getElementById('fz');
    const vfInput = document.getElementById('vf');
    const flutes = parseFloat(document.getElementById('flutes').value);
    const rpm = parseFloat(document.getElementById('rpm').value);

    if (vfInput.value!== '' &&!vfInput.classList.contains('locked')) {
        lockedFeedV = 'vf';
        fzInput.classList.add('locked');
        fzInput.readOnly = true;

        if (flutes > 0 && rpm > 0 && parseFloat(vfInput.value) > 0) {
            const vf = parseFloat(vfInput.value);
            const fz = vf / (flutes * rpm);
            fzInput.value = fz.toFixed(3);
        } else fzInput.value = '';
    } else if (vfInput.value === '' && lockedFeedV === 'fz') unlockFeedV();
    calculateVolumill();
}

function unlockSpeedV() {
    lockedSpeedV = null;
    const rpmInput = document.getElementById('rpm');
    const vcInput = document.getElementById('vc');
    rpmInput.classList.remove('locked');
    rpmInput.readOnly = false;
    vcInput.classList.remove('locked');
    vcInput.readOnly = false;
}

function unlockFeedV() {
    lockedFeedV = null;
    const fzInput = document.getElementById('fz');
    const vfInput = document.getElementById('vf');
    fzInput.classList.remove('locked');
    fzInput.readOnly = false;
    vfInput.classList.remove('locked');
    vfInput.readOnly = false;
}

function resetFormV() {
    document.getElementById('calc-form-v').reset();
    unlockSpeedV();
    unlockFeedV();
    document.getElementById('warning-box-v').style.display = 'none';
    document.getElementById('res-factor-v').textContent = '---';
    document.getElementById('res-fz-v').textContent = '---';
    document.getElementById('res-vf-v').textContent = '---';
}

function calculateVolumill() {
    const fz = parseFloat(document.getElementById('fz').value);
    const vf = parseFloat(document.getElementById('vf').value);
    const ae_fab = parseFloat(document.getElementById('ae_fab').value);
    const ae_tra = parseFloat(document.getElementById('ae_tra').value);

    const warningBox = document.getElementById('warning-box-v');
    let warnings = [];

    if (ae_fab > 0.5 || ae_tra > 0.5) {
        warnings.push("⚠️ Un ae mayor a 0.5 (50%D) no aplica para el cálculo de VoluMill/Mecanizado Trocoidal.");
    }

    if (ae_tra > ae_fab && ae_fab > 0) {
        warnings.push("⚠️ El ae a trabajar es mayor que el ae del fabricante. El avance se reducirá.");
    }

    if (warnings.length > 0) {
        warningBox.innerHTML = warnings.join('<br>');
        warningBox.style.display = 'block';
    } else {
        warningBox.style.display = 'none';
    }

    if (!isNaN(fz) &&!isNaN(vf) &&!isNaN(ae_fab) &&!isNaN(ae_tra) && ae_fab > 0 && ae_tra > 0) {
        const eff_ae_fab = Math.min(ae_fab, 0.5);
        const eff_ae_tra = Math.min(ae_tra, 0.5);

        const num = Math.sin(Math.acos(1 - 2 * eff_ae_fab));
        const den = Math.sin(Math.acos(1 - 2 * eff_ae_tra));

        if (den!== 0 &&!isNaN(num) &&!isNaN(den)) {
            const factor = num / den;
            const fz_adj = fz * factor;
            const vf_adj = vf * factor;

            const unitFz = unitV === 'metric'? 'mm/f' : 'in/f';
            const unitVf = unitV === 'metric'? 'mm/min' : 'in/min';

            document.getElementById('res-factor-v').textContent = factor.toFixed(3);
            document.getElementById('res-fz-v').textContent = fz_adj.toFixed(3) + ' ' + unitFz;
            document.getElementById('res-vf-v').textContent = vf_adj.toFixed(3) + ' ' + unitVf;
            return;
        }
    }

    document.getElementById('res-factor-v').textContent = '---';
    document.getElementById('res-fz-v').textContent = '---';
    document.getElementById('res-vf-v').textContent = '---';
}

let unitMrr = 'metric';
let savedMrrConfigs = [];

function setUnitMrr(targetUnit, force = false) {
    if (unitMrr === targetUnit &&!force) return;
    
    unitMrr = targetUnit;

    document.getElementById('unit-ap-mrr').textContent = targetUnit === 'metric'? 'mm' : 'pulg';
    document.getElementById('unit-ae-mrr').textContent = targetUnit === 'metric'? 'mm' : 'pulg';
    document.getElementById('unit-vf-mrr').textContent = targetUnit === 'metric'? 'mm/min' : 'in/min';

    const apEl = document.getElementById('mrr_ap');
    const aeEl = document.getElementById('mrr_ae');
    const vfEl = document.getElementById('mrr_vf');

    if (!force) {
        if (apEl.value!== '') {
            const val = parseFloat(apEl.value);
            apEl.value = targetUnit === 'imperial'? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }

        if (aeEl.value!== '') {
            const val = parseFloat(aeEl.value);
            aeEl.value = targetUnit === 'imperial'? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }

        if (vfEl.value!== '') {
            const val = parseFloat(vfEl.value);
            vfEl.value = targetUnit === 'imperial'? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }
    }

    calculateMrrPage();
}

function resetFormMrr() {
    document.getElementById('calc-form-mrr').reset();
    document.getElementById('warning-box-mrr').style.display = 'none';
    document.getElementById('res-mrr-val').textContent = '---';
}

function calculateMrrPage() {
    const ap = parseFloat(document.getElementById('mrr_ap').value);
    const ae = parseFloat(document.getElementById('mrr_ae').value);
    const vf = parseFloat(document.getElementById('mrr_vf').value);

    if (!isNaN(ap) && ap > 0 &&!isNaN(ae) && ae > 0 &&!isNaN(vf) && vf > 0) {
        let mrr = 0;
        let unitStr = '';

        if (unitMrr === 'metric') {
            mrr = (ap * ae * vf) / 1000;
            unitStr = 'cm³/min';
        } else {
            mrr = ap * ae * vf;
            unitStr = 'in³/min';
        }

        document.getElementById('res-mrr-val').textContent = mrr.toFixed(3) + ' ' + unitStr;
        document.getElementById('warning-box-mrr').style.display = 'none';
        return mrr;
    } else {
        document.getElementById('res-mrr-val').textContent = '---';
        return null;
    }
}

function addMrrComparison() {
    calculateMrrPage();
    const ap = document.getElementById('mrr_ap').value;
    const ae = document.getElementById('mrr_ae').value;
    const vf = document.getElementById('mrr_vf').value;
    const mrrTxt = document.getElementById('res-mrr-val').textContent;
    const warnBox = document.getElementById('warning-box-mrr');

    if (mrrTxt === '---') {
        warnBox.innerHTML = '⚠️ Ingresa valores válidos en ap, ae y Vf para poder guardar en la tabla.';
        warnBox.style.display = 'block';
        return;
    }

    warnBox.style.display = 'none';
    const unitTag = unitMrr === 'metric'? 'mm' : 'in';

    savedMrrConfigs.push({
        id: Date.now(),
        ap: ap + ' ' + unitTag,
        ae: ae + ' ' + unitTag,
        vf: vf + (unitMrr === 'metric'? ' mm/min' : ' in/min'),
        mrrTxt: mrrTxt,
        mrrVal: parseFloat(mrrTxt)
    });

    renderMrrTable();
}

function clearMrrTable() {
    savedMrrConfigs = [];
    renderMrrTable();
}

function removeMrrConfig(id) {
    savedMrrConfigs = savedMrrConfigs.filter(c => c.id!== id);
    renderMrrTable();
}

function renderMrrTable() {
    const tbody = document.getElementById('mrr-tbody');
    if (savedMrrConfigs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">
                    Ingresa ap, ae, Vf y presiona "Guardar en Tabla" para comparar.
                </td>
            </tr>
       `;
        return;
    }

    let maxVal = -1;
    savedMrrConfigs.forEach(c => {
        if (c.mrrVal > maxVal) maxVal = c.mrrVal;
    });

    tbody.innerHTML = savedMrrConfigs.map((c, idx) => {
        const isMax = c.mrrVal === maxVal && maxVal > 0;
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${c.ap}</td>
                <td>${c.ae}</td>
                <td>${c.vf}</td>
                <td class="${isMax? 'mrr-badge' : ''}">${c.mrrTxt} ${isMax? '🏆' : ''}</td>
                <td><button class="btn-remove" onclick="removeMrrConfig(${c.id})">✕</button></td>
            </tr>
        `;
    }).join('');
}

// --- PESTAÑA 3: INTERPOLACIÓN CIRCULAR (AVANCE TANGENCIAL) ---
let unitCirc = 'metric';
let circularMode = 'interior'; // 'interior' | 'exterior'

function setCircularMode(mode) {
    circularMode = mode;
    const btnInterior = document.getElementById('circ-mode-interior');
    const btnExterior = document.getElementById('circ-mode-exterior');
    const labelPartDia = document.getElementById('label-part-dia');

    if (mode === 'interior') {
        if (btnInterior) btnInterior.classList.add('active');
        if (btnExterior) btnExterior.classList.remove('active');
        if (labelPartDia) labelPartDia.textContent = 'Diámetro Cajera / Agujero (Dp)';
    } else {
        if (btnInterior) btnInterior.classList.remove('active');
        if (btnExterior) btnExterior.classList.add('active');
        if (labelPartDia) labelPartDia.textContent = 'Diámetro Macho / Contorno (Dp)';
    }

    calculateCircular();
}

function calculateCircular() {
    const diaInput = document.getElementById('circ_dia');
    const partDiaInput = document.getElementById('circ_part_dia');
    const vfInput = document.getElementById('circ_vf');
    const warnBox = document.getElementById('warning-box-circ');

    const resFprog = document.getElementById('res-circ-fprog');
    const resFreal = document.getElementById('res-circ-freal');
    const resFactor = document.getElementById('res-circ-factor');
    const resDcenter = document.getElementById('res-circ-dcenter');

    if (!diaInput || !partDiaInput || !vfInput) return;

    const d = parseFloat(diaInput.value);
    const dp = parseFloat(partDiaInput.value);
    const vf = parseFloat(vfInput.value);

    // Reset warnings
    if (warnBox) {
        warnBox.style.display = 'none';
        warnBox.innerHTML = '';
    }

    if (isNaN(d) || isNaN(dp) || isNaN(vf) || d <= 0 || dp <= 0 || vf <= 0) {
        if (resFprog) resFprog.textContent = '---';
        if (resFreal) resFreal.textContent = '---';
        if (resFactor) resFactor.textContent = '---';
        if (resDcenter) resDcenter.textContent = '---';
        return;
    }

    const unitFeed = unitCirc === 'metric' ? ' mm/min' : ' in/min';
    const unitDist = unitCirc === 'metric' ? ' mm' : ' pulg';

    if (circularMode === 'interior') {
        if (d >= dp) {
            if (warnBox) {
                warnBox.innerHTML = '⚠️ En mecanizado interior, el diámetro de la herramienta (D) debe ser menor al diámetro de la cajera/agujero (Dp).';
                warnBox.style.display = 'block';
            }
            if (resFprog) resFprog.textContent = '---';
            if (resFreal) resFreal.textContent = '---';
            if (resFactor) resFactor.textContent = '---';
            if (resDcenter) resDcenter.textContent = '---';
            return;
        }

        const dc = dp - d;
        const ratioProg = dc / dp; // Fprog = Vf * (Dp - D) / Dp
        const ratioReal = dp / dc; // Freal sin compensar = Vf * Dp / (Dp - D)
        const fProg = vf * ratioProg;
        const fReal = vf * ratioReal;
        const deltaPct = ((fProg - vf) / vf) * 100;

        if (resFprog) resFprog.textContent = fProg.toFixed(1) + unitFeed;
        if (resFreal) resFreal.textContent = fReal.toFixed(1) + unitFeed;
        if (resFactor) resFactor.textContent = `${ratioProg.toFixed(3)} (${deltaPct.toFixed(1)}%)`;
        if (resDcenter) resDcenter.textContent = dc.toFixed(3) + unitDist;
    } else {
        // Macho / Contorno Exterior
        const dc = dp + d;
        const ratioProg = dc / dp; // Fprog = Vf * (Dp + D) / Dp
        const ratioReal = dp / dc; // Freal sin compensar = Vf * Dp / (Dp + D)
        const fProg = vf * ratioProg;
        const fReal = vf * ratioReal;
        const deltaPct = ((fProg - vf) / vf) * 100;

        if (resFprog) resFprog.textContent = fProg.toFixed(1) + unitFeed;
        if (resFreal) resFreal.textContent = fReal.toFixed(1) + unitFeed;
        if (resFactor) resFactor.textContent = `${ratioProg.toFixed(3)} (+${deltaPct.toFixed(1)}%)`;
        if (resDcenter) resDcenter.textContent = dc.toFixed(3) + unitDist;
    }
}

function resetFormCircular() {
    const diaInput = document.getElementById('circ_dia');
    const partDiaInput = document.getElementById('circ_part_dia');
    const vfInput = document.getElementById('circ_vf');
    const warnBox = document.getElementById('warning-box-circ');

    if (diaInput) diaInput.value = '';
    if (partDiaInput) partDiaInput.value = '';
    if (vfInput) vfInput.value = '';
    if (warnBox) {
        warnBox.style.display = 'none';
        warnBox.innerHTML = '';
    }

    const resFprog = document.getElementById('res-circ-fprog');
    const resFreal = document.getElementById('res-circ-freal');
    const resFactor = document.getElementById('res-circ-factor');
    const resDcenter = document.getElementById('res-circ-dcenter');

    if (resFprog) resFprog.textContent = '---';
    if (resFreal) resFreal.textContent = '---';
    if (resFactor) resFactor.textContent = '---';
    if (resDcenter) resDcenter.textContent = '---';
}

function setUnitCircular(targetUnit, force = false) {
    if (unitCirc === targetUnit && !force) return;

    unitCirc = targetUnit;

    const unitDia = document.getElementById('unit-dia-circ');
    const unitPartDia = document.getElementById('unit-partdia-circ');
    const unitVf = document.getElementById('unit-vf-circ');

    if (unitDia) unitDia.textContent = targetUnit === 'metric' ? 'mm' : 'pulg';
    if (unitPartDia) unitPartDia.textContent = targetUnit === 'metric' ? 'mm' : 'pulg';
    if (unitVf) unitVf.textContent = targetUnit === 'metric' ? 'mm/min' : 'in/min';

    const diaEl = document.getElementById('circ_dia');
    const partDiaEl = document.getElementById('circ_part_dia');
    const vfEl = document.getElementById('circ_vf');

    if (!force) {
        if (diaEl && diaEl.value !== '') {
            const val = parseFloat(diaEl.value);
            diaEl.value = targetUnit === 'imperial' ? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }
        if (partDiaEl && partDiaEl.value !== '') {
            const val = parseFloat(partDiaEl.value);
            partDiaEl.value = targetUnit === 'imperial' ? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }
        if (vfEl && vfEl.value !== '') {
            const val = parseFloat(vfEl.value);
            vfEl.value = targetUnit === 'imperial' ? (val / 25.4).toFixed(3) : (val * 25.4).toFixed(3);
        }
    }

    calculateCircular();
}