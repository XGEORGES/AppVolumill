// --- INICIO LOCAL DE LA APLICACIÓN ---

document.addEventListener('DOMContentLoaded', function () {
    const loginScreen = document.getElementById('login-screen');
    const licenseScreen = document.getElementById('license-screen');
    const appContent = document.getElementById('app-content');

    if (loginScreen) {
        loginScreen.style.display = 'none';
    }

    if (licenseScreen) {
        licenseScreen.style.display = 'none';
    }

    if (appContent) {
        appContent.style.display = 'block';
    }

    // Registrar el Service Worker para soporte PWA y Offline
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
           .then((registration) => {
                console.log('Service Worker registrado con éxito en el scope:', registration.scope);
            })
           .catch((error) => {
                console.error('Error al registrar el Service Worker:', error);
            });
    }

    // Inicializar configuraciones guardadas
    initSettings();
});

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
    } else {
        if (unitToggle) unitToggle.checked = false;
        if (unitsStatus) unitsStatus.textContent = 'Métrico';
        setUnitVolumill('metric', true);
        setUnitMrr('metric', true);
    }
}

// Manejador del toggle de Unidades
function handleUnitToggle(elem) {
    const statusText = document.getElementById('units-status');
    const targetUnit = elem.checked? 'imperial' : 'metric';
    
    statusText.textContent = elem.checked? 'Pulgadas' : 'Métrico';
    
    setUnitVolumill(targetUnit, false);
    setUnitMrr(targetUnit, false);
    
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

    document.getElementById('tab-btn-volumill').classList.toggle('active', tabName === 'volumill');
    document.getElementById('tab-btn-mrr').classList.toggle('active', tabName === 'mrr');
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