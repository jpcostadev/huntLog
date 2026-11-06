import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View, Image, useWindowDimensions,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { buildHuntWorkbook } from './src/lib/reportWorkbook';
import { estimateHuntValueInReal, estimateTibiaCoinTrade } from './src/lib/tibiaCoinCalculator';
import { formatCompactNumber, formatCompactReais } from './src/lib/numberFormat';
import { router } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearHunts as clearStoredHunts, deleteHunt as deleteStoredHunt, deleteHunts as deleteStoredHunts, deleteHuntLocation, loadHuntData, loadSavedHuntLocations, loadTibiaCoinRates, renameHuntLocation, saveCharacter as persistCharacter, saveHunt as persistHunt, saveHuntLocation, saveTibiaCoinRates } from './src/lib/storage';
import type { CharacterInput, CharacterProfile, Hunt, TibiaCoinPriceTier, TibiaCoinRates, TibiaSession } from './src/lib/models';
import { parseTibiaSession } from './src/lib/tibiaSessionParser';
import {
  Activity, AlertCircle, ArrowDownLeft, ArrowUpRight, CalendarDays, Calculator as CalculatorIcon, Check, ChevronRight, Coins, Crown,
  FileSpreadsheet, Flame, Image as ImageIcon, MapPin, Plus, Search, ScrollText, Share2, Shield, Sparkles,
  BarChart3, Eye, List, Pencil, RefreshCw, Swords, Timer, Trash2, TrendingUp, Trophy, UserRound, X, Zap,
} from 'lucide-react-native';

type Tab = 'home' | 'hunts' | 'performance' | 'reports' | 'calculator' | 'share' | 'profile';
type HuntPeriod = '1d'|'7d'|'30d'|'all';
type PerformanceMetric = 'profit'|'xp'|'xpHour'|'profitHour';
const C = {
  bg: '#080D14', panel: '#101923', panel2: '#131F2B', line: '#20303C',
  text: '#F2F6F7', muted: '#83939D', lime: '#C5F36B', green: '#8CE1A5',
  cyan: '#58D9E8', orange: '#FFB967', red: '#FF7586', deep: '#09120F',
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const n = (v: number) => new Intl.NumberFormat('pt-BR').format(v || 0);
const gpAmountDisplay = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number.isFinite(v) ? v : 0);
const money = (v: number) => ` ${formatCompactNumber(v)} gp`;
const xpShort = (v: number) => formatCompactNumber(v);
// XP, levels, gold and duration are whole numbers. Ignore pasted grouping
// separators, so both "1500000" and "1.500.000" become the same value.
const asInteger = (s: string) => Number(s.replace(/\D/g, '')) || 0;
const asDecimal = (raw: string) => {
  let value = raw.replace(/[^\d,.-]/g, '');
  const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) value = comma > dot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  else if (comma >= 0) value = value.replace(',', '.');
  else if (dot >= 0 && value.length - dot - 1 === 3) value = value.replace(/\./g, '');
  else if ((value.match(/\./g) ?? []).length > 1) value = value.replace(/\./g, '');
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const localizedAmount = (value: number, fractionDigits = 6, minimumFractionDigits = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits, maximumFractionDigits: fractionDigits }).format(value);
const toDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const dateLabel = (s: string) => toDate(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').toUpperCase();
const performanceValue = (h: Hunt, metric: PerformanceMetric) => {
  const profit = h.loot - h.supplies;
  if (metric === 'profit') return profit;
  if (metric === 'xp') return h.xp;
  if (metric === 'xpHour') return h.duration > 0 ? h.xp * 60 / h.duration : 0;
  return h.duration > 0 ? profit * 60 / h.duration : 0;
};
const performanceNumber = (value: number, metric: PerformanceMetric) => metric === 'profit' || metric === 'profitHour' ? `${formatCompactNumber(Math.round(value))} gp` : `${formatCompactNumber(Math.round(value))} XP`;

export function AppScreen({tab}: {tab: Tab}) {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [savedHuntLocations, setSavedHuntLocations] = useState<string[]>([]);
  const [savedHuntLocationsOpen, setSavedHuntLocationsOpen] = useState(false);
  const [savedHuntLocationQuery, setSavedHuntLocationQuery] = useState('');
  const [renamingSavedLocation, setRenamingSavedLocation] = useState<string | null>(null);
  const [savedLocationDraft, setSavedLocationDraft] = useState('');
  const [refreshingHunts, setRefreshingHunts] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedHuntIds, setSelectedHuntIds] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formErrorTitle, setFormErrorTitle] = useState('Confira os dados da hunt');
  const [editing, setEditing] = useState<Hunt | null>(null);
  const [period, setPeriod] = useState<HuntPeriod>('30d');
  const [selected, setSelected] = useState<number | null>(null);
  const [detailHuntId, setDetailHuntId] = useState<number | null>(null);
  const [huntSort, setHuntSort] = useState<'recent'|'profit'|'xp'|'xpHour'>('recent');
  const [performanceMetric, setPerformanceMetric] = useState<PerformanceMetric>('profitHour');
  const [huntQuery, setHuntQuery] = useState('');
  const [huntPeriod, setHuntPeriod] = useState<HuntPeriod>('all');
  const [huntDate, setHuntDate] = useState('');
  const [shareQuery, setShareQuery] = useState('');
  const [sharePeriod, setSharePeriod] = useState<HuntPeriod>('all');
  const [shareDate, setShareDate] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileVocation, setProfileVocation] = useState('EK');
  const [profileLevel, setProfileLevel] = useState('');
  const [profilePrimary, setProfilePrimary] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [sessionText, setSessionText] = useState('');
  const [importedSession, setImportedSession] = useState<TibiaSession | null>(null);
  const [importError, setImportError] = useState('');
  const [reportExporting, setReportExporting] = useState(false);
  const [reportExportError, setReportExportError] = useState('');
  const [sellTiers, setSellTiers] = useState<TibiaCoinPriceTier[]>([{minimumTc:25,lotTc:25,realPrice:7},{minimumTc:250,lotTc:250,realPrice:52},{minimumTc:5000,lotTc:250,realPrice:51.5},{minimumTc:10000,lotTc:250,realPrice:51}]);
  const [tcGpAmount, setTcGpAmount] = useState('');
  const [calculatorTcAmount, setCalculatorTcAmount] = useState('25');
  const [tcRatesLoaded, setTcRatesLoaded] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && screenWidth >= 900;
  const hasSessionPeriod = /^\s*Session data:\s*From/im.test(sessionText) || /^\s*\d{2}:\d{2}:\d{2}\s+to\s+\d{4}-\d{2}-\d{2},\s*\d{2}:\d{2}:\d{2}/im.test(sessionText);
  const cardRef = useRef<React.ElementRef<typeof View>>(null);
  const [form, setForm] = useState({ date: today(), character: '', vocation: 'EK', level: '', location: '', duration: '60', xp: '', loot: '', supplies: '', primary: false });

  const refresh = async () => {
    const data = await loadHuntData();
    setHunts(data.hunts);
    setCharacters(data.characters);
  };
  const refreshHuntsNow = async () => {
    if (refreshingHunts) return;
    setRefreshingHunts(true);
    try {
      await refresh();
      setToast('Lista de hunts atualizada');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao ler os dados locais.';
      setToast(`Não foi possível atualizar: ${message}`);
    } finally {
      setRefreshingHunts(false);
    }
  };
  useEffect(() => {
    loadHuntData()
      .then(data => { setHunts(data.hunts); setCharacters(data.characters); })
      .catch(() => setToast('Não foi possível carregar os dados salvos.'));
  }, []);
  useEffect(() => { loadSavedHuntLocations().then(setSavedHuntLocations).catch(() => undefined); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    let active = true;
    loadTibiaCoinRates().then(rates => {
      if (!active) return;
      if (rates.sellTiers?.length) setSellTiers(rates.sellTiers);
      setTcGpAmount(rates.gpAmount ? localizedAmount(rates.gpAmount) : '');
      setTcRatesLoaded(true);
    }).catch(() => { if (active) setTcRatesLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!tcRatesLoaded) return;
    const rates: TibiaCoinRates = { realPer250:0, realLotAmount:250, realBuyAmount:0, realSellAmount:0, tcAmount:25, gpAmount:asDecimal(tcGpAmount), sellTiers };
    const timer = setTimeout(() => { void saveTibiaCoinRates(rates).catch(() => setToast('Não consegui salvar as taxas de TC.')); }, 550);
    return () => clearTimeout(timer);
  }, [tcRatesLoaded, sellTiers, tcGpAmount]);

  const selectedHunt = hunts.find(h => h.id === selected) ?? null;
  const detailHunt = hunts.find(h => h.id === detailHuntId) ?? null;
  const openDetails = (h: Hunt) => setDetailHuntId(h.id);
  const primaryCharacter = characters.find(character => character.isPrimary);
  const applyHuntFilters = (rows: Hunt[], query: string, selectedPeriod: HuntPeriod, exactDate: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const cutoff = new Date();
    const days = selectedPeriod === '1d' ? 0 : selectedPeriod === '7d' ? 7 : 30;
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0,0,0,0);
    return rows.filter(h => {
      const matchesQuery = !normalizedQuery || `${h.location} ${h.character} ${h.vocation}`.toLocaleLowerCase().includes(normalizedQuery);
      const matchesPeriod = selectedPeriod === 'all' || (selectedPeriod === '1d' ? h.date === today() : toDate(h.date) >= cutoff);
      const matchesExactDate = !exactDate.trim() || h.date === exactDate.trim();
      return matchesQuery && matchesPeriod && matchesExactDate;
    });
  };
  const huntList = useMemo(() => applyHuntFilters(hunts, huntQuery, huntPeriod, huntDate), [hunts, huntQuery, huntPeriod, huntDate]);
  const sortedHuntList = useMemo(() => [...huntList].sort((a,b) => {
    if (huntSort === 'recent') return b.date.localeCompare(a.date) || b.id - a.id;
    if (huntSort === 'profit') return (b.loot-b.supplies)-(a.loot-a.supplies);
    if (huntSort === 'xp') return b.xp-a.xp;
    return performanceValue(b,'xpHour')-performanceValue(a,'xpHour');
  }), [huntList,huntSort]);
  const performanceList = useMemo(() => applyHuntFilters(hunts, huntQuery, huntPeriod, huntDate), [hunts,huntQuery,huntPeriod,huntDate]);
  const performanceScored = useMemo(() => performanceList.map(h => ({hunt:h,value:performanceValue(h,performanceMetric)})).sort((a,b)=>b.value-a.value), [performanceList,performanceMetric]);
  const performanceAverage = performanceScored.length ? performanceScored.reduce((sum,row)=>sum+row.value,0)/performanceScored.length : 0;
  const shareList = useMemo(() => applyHuntFilters(hunts, shareQuery, sharePeriod, shareDate), [hunts, shareQuery, sharePeriod, shareDate]);
  const filtered = useMemo(() => {
    if (period === 'all') return hunts;
    if (period === '1d') return hunts.filter(h => h.date === today());
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (period === '7d' ? 7 : 30)); cutoff.setHours(0,0,0,0);
    return hunts.filter(h => toDate(h.date) >= cutoff);
  }, [hunts, period]);
  const totals = (rows: Hunt[]) => rows.reduce((a,h) => ({ xp:a.xp+h.xp, loot:a.loot+h.loot, supplies:a.supplies+h.supplies, profit:a.profit+h.loot-h.supplies, minutes:a.minutes+h.duration }), { xp:0, loot:0, supplies:0, profit:0, minutes:0 });
  const allTotals = totals(hunts), reportTotals = totals(filtered);
  const currentTcRates: TibiaCoinRates = { realPer250:0, realLotAmount:250, realBuyAmount:0, realSellAmount:0, tcAmount:25, gpAmount:asDecimal(tcGpAmount), sellTiers };
  const tcRateGpPerTc = currentTcRates.tcAmount > 0 ? currentTcRates.gpAmount / currentTcRates.tcAmount : 0;
  const selectedHuntEstimate = selectedHunt ? estimateHuntValueInReal(selectedHunt.loot-selectedHunt.supplies,currentTcRates) : null;
  const lifetimeHuntEstimates = hunts.map(hunt => estimateHuntValueInReal(hunt.loot-hunt.supplies,currentTcRates));
  const lifetimeTcEquivalent = lifetimeHuntEstimates.reduce((sum,estimate)=>sum+(estimate.gpPerTc>0?estimate.tcEquivalent:0),0);
  const lifetimeRealEstimate = lifetimeHuntEstimates.some(estimate=>estimate.realValue!==null)
    ? lifetimeHuntEstimates.reduce((sum,estimate)=>sum+(estimate.realValue??0),0) : null;
  const huntEstimates = filtered.map(hunt => ({hunt, estimate:estimateHuntValueInReal(hunt.loot-hunt.supplies,currentTcRates)}));
  const huntTcEquivalent = huntEstimates.reduce((sum,row)=>sum+(row.estimate.gpPerTc>0?row.estimate.tcEquivalent:0),0);
  const configuredHuntEstimates = huntEstimates.filter(row=>row.estimate.realValue!==null);
  const huntRealEstimate = configuredHuntEstimates.length ? configuredHuntEstimates.reduce((sum,row)=>sum+(row.estimate.realValue??0),0) : null;
  const calculatorTc = asDecimal(calculatorTcAmount);
  const calculatorTrade = estimateTibiaCoinTrade(calculatorTc, currentTcRates);
  const calculatorGpValue = calculatorTrade.gpValue;
  const daily = useMemo(() => {
    const days = Array.from({length:7},(_,i) => { const d = new Date(); d.setDate(d.getDate() - (6-i)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
    return days.map(date => ({ date, xp: hunts.filter(h=>h.date===date).reduce((s,h)=>s+h.xp,0) }));
  }, [hunts]);
  const maxDaily = Math.max(1, ...daily.map(x=>x.xp));
  const save = async () => {
    if (saving) return;
    const character = form.character.trim(), location = form.location.trim();
    const date = new Date(`${form.date}T00:00:00`);
    if (!character || !location || !/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(date.getTime())) {
      setFormErrorTitle('Dados obrigatórios');
      setFormError('Preencha personagem, local e uma data válida.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await persistHunt({
        date: form.date, character, vocation: form.vocation, level: asInteger(form.level),
        location, duration: asInteger(form.duration), xp: asInteger(form.xp),
        loot: asInteger(form.loot), supplies: asInteger(form.supplies), session: importedSession,
      }, editing?.id ?? null, form.primary);
      await refresh();
      setFormOpen(false);
      setEditing(null);
      setToast(editing ? 'Hunt atualizada' : 'Hunt salva no grimório');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado ao salvar.';
      setFormErrorTitle('Não foi possível salvar a hunt');
      setFormError(`Não foi possível salvar: ${message}`);
    } finally {
      setSaving(false);
    }
  };
  const saveCurrentHuntLocation = async () => {
    const name = form.location.trim();
    if (!name) { setToast('Digite o nome da hunt antes de salvar nos nomes reutilizáveis'); return; }
    try {
      await saveHuntLocation(name);
      setSavedHuntLocations(await loadSavedHuntLocations());
      setToast('Nome salvo para reutilizar');
    } catch (error) {
      setToast(`Não foi possível salvar o nome: ${error instanceof Error ? error.message : 'erro local.'}`);
    }
  };
  const pickSavedHuntLocation = (name: string) => {
    setForm(current => ({...current,location:name}));
    setSavedHuntLocationsOpen(false);
    setSavedHuntLocationQuery('');
  };
  const beginRenameSavedLocation = (name: string) => { setRenamingSavedLocation(name); setSavedLocationDraft(name); };
  const commitRenameSavedLocation = async () => {
    if (!renamingSavedLocation) return;
    try {
      await renameHuntLocation(renamingSavedLocation, savedLocationDraft);
      setSavedHuntLocations(await loadSavedHuntLocations());
      if (form.location.toLocaleLowerCase() === renamingSavedLocation.toLocaleLowerCase()) setForm(current => ({...current,location:savedLocationDraft.trim()}));
      setRenamingSavedLocation(null);
      setToast('Nome da hunt atualizado');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível editar esse nome.'); }
  };
  const removeSavedHuntLocation = (name: string) => {
    const run = async () => {
      try {
        await deleteHuntLocation(name);
        setSavedHuntLocations(await loadSavedHuntLocations());
        if (renamingSavedLocation === name) setRenamingSavedLocation(null);
        setToast('Nome removido da lista de reutilização');
      } catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível apagar esse nome.'); }
    };
    const message = `Remover “${name}” dos nomes salvos? Hunts já registradas não serão alteradas.`;
    if (Platform.OS === 'web') { if (globalThis.confirm(message)) void run(); return; }
    Alert.alert('Apagar nome salvo?', message, [{text:'Cancelar',style:'cancel'},{text:'Apagar',style:'destructive',onPress:()=>void run()}]);
  };
  const openNew = () => {
    setEditing(null);
    setFormError('');
    setSessionText(''); setImportedSession(null); setImportError('');
    setForm({
      date:today(), character:primaryCharacter?.name ?? '', vocation:primaryCharacter?.vocation ?? 'EK',
      level:primaryCharacter?.level ? String(primaryCharacter.level) : '', location:'', duration:'60', xp:'', loot:'', supplies:'',
      primary:Boolean(primaryCharacter),
    });
    setFormOpen(true);
  };
  const openEdit = (h: Hunt) => {
    setEditing(h);
    setFormError('');
    setSessionText(''); setImportedSession(h.session ?? null); setImportError('');
    setForm({ date:h.date, character:h.character, vocation:h.vocation, level:String(h.level), location:h.location,
      duration:String(h.duration), xp:String(h.xp), loot:String(h.loot), supplies:String(h.supplies),
      primary:characters.some(c=>c.name.toLowerCase()===h.character.toLowerCase()&&c.isPrimary) });
    setFormOpen(true);
  };
  const importSession = () => {
    try {
      const parsed = parseTibiaSession(sessionText);
      setImportedSession(parsed.details);
      setForm(current => ({ ...current, date: parsed.date, duration: String(parsed.duration), xp: String(parsed.xp), loot: String(parsed.loot), supplies: String(parsed.supplies) }));
      setImportError('');
      setToast(`Sessão lida · ${parsed.details.monsters.length} monstros · ${parsed.details.items.length} itens`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível ler a sessão.');
    }
  };
  const exportReport = async () => {
    if (reportExporting) return;
    if (!filtered.length) {
      setReportExportError('Não há hunts no período selecionado para exportar.');
      return;
    }
    setReportExporting(true);
    setReportExportError('');
    try {
      const fileName = `huntlog-relatorio-${today()}.xlsx`;
      const bytes = buildHuntWorkbook(filtered, currentTcRates);
      if (Platform.OS === 'web') {
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setToast('Relatório Excel baixado.');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.');
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      await file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Exportar relatório de hunts',
      });
      setToast('Arquivo Excel pronto para salvar ou compartilhar.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      if (Platform.OS === 'web') setReportExportError(`Não consegui exportar o Excel: ${message}`);
      else Alert.alert('Falha ao exportar relatório', message);
    } finally {
      setReportExporting(false);
    }
  };
  const remove = (h: Hunt) => {
    const confirmAndDelete = async () => {
      try {
        await deleteStoredHunt(h.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao remover do armazenamento local.';
        if (/não foi encontrada/i.test(message)) {
          try {
            const data = await loadHuntData();
            setHunts(data.hunts);
            setCharacters(data.characters);
            if (!data.hunts.some(item => Number(item.id) === Number(h.id))) {
              if (detailHuntId === h.id) setDetailHuntId(null);
              setToast('A hunt já não estava salva; lista atualizada');
              return;
            }
          } catch { /* Mostrar a falha real de leitura abaixo. */ }
        }
        setToast(`Não foi possível apagar: ${message}`);
        return;
      }
      setHunts(current=>current.filter(item=>Number(item.id)!==Number(h.id)));
      if (detailHuntId===h.id) setDetailHuntId(null);
      try { await refresh(); } catch { /* A remoção persistiu; manter a lista otimista. */ }
      setToast('Hunt removida');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`Apagar a hunt em ${h.location}?`)) void confirmAndDelete();
      return;
    }
    Alert.alert('Apagar hunt?', `A sessão em ${h.location} será removida.`, [{text:'Cancelar',style:'cancel'},{text:'Apagar',style:'destructive',onPress:()=>void confirmAndDelete()}]);
  };
  const removeSelected = () => {
    const ids = [...selectedHuntIds];
    if (!ids.length) return;
    const run = async () => {
      try {
        await deleteStoredHunts(ids);
        setHunts(current => current.filter(hunt => !selectedHuntIds.has(Number(hunt.id))));
        setSelectedHuntIds(new Set());
        setSelectionMode(false);
        await refresh().catch(() => undefined);
        setToast(`${ids.length} ${ids.length === 1 ? 'hunt apagada' : 'hunts apagadas'}`);
      } catch (error) {
        setToast(`Falha ao apagar: ${error instanceof Error ? error.message : 'erro no armazenamento local.'}`);
      }
    };
    const message = `Apagar ${ids.length} ${ids.length === 1 ? 'hunt selecionada' : 'hunts selecionadas'}? Essa ação não pode ser desfeita.`;
    if (Platform.OS === 'web') { if (globalThis.confirm(message)) void run(); return; }
    Alert.alert('Apagar hunts selecionadas?', message, [{text:'Cancelar',style:'cancel'},{text:'Apagar',style:'destructive',onPress:()=>void run()}]);
  };
  const clearHistory = () => {
    const run = async () => {
      try {
        await clearStoredHunts();
        setHunts([]);
        setSelectedHuntIds(new Set());
        setSelectionMode(false);
        await refresh().catch(() => undefined);
        setToast('Histórico zerado; relatórios e desempenho atualizados');
      } catch (error) {
        setToast(`Falha ao zerar histórico: ${error instanceof Error ? error.message : 'erro no armazenamento local.'}`);
      }
    };
    const message = 'Isso apaga todas as hunts e zera os relatórios e o desempenho. Personagens salvos e cotação de TC serão mantidos. Essa ação não pode ser desfeita.';
    if (Platform.OS === 'web') { if (globalThis.confirm(message)) void run(); return; }
    Alert.alert('Zerar histórico de hunts?', message, [{text:'Cancelar',style:'cancel'},{text:'Zerar histórico',style:'destructive',onPress:()=>void run()}]);
  };
  const chooseCharacter = (profile: CharacterProfile) => setForm({
    ...form, character:profile.name, vocation:profile.vocation, level:String(profile.level), primary:profile.isPrimary,
  });
  const editProfile = (profile: CharacterProfile) => {
    setProfileName(profile.name);
    setProfileVocation(profile.vocation);
    setProfileLevel(String(profile.level));
    setProfilePrimary(profile.isPrimary);
  };
  const saveProfile = async () => {
    const name = profileName.trim();
    if (!name) { setToast('Digite o nome do personagem'); return; }
    const input: CharacterInput = { name, vocation:profileVocation, level:asInteger(profileLevel), isPrimary:profilePrimary || characters.length === 0 };
    setProfileSaving(true);
    try {
      await persistCharacter(input);
      await refresh();
      setProfileName(input.name);
      setProfilePrimary(input.isPrimary);
      setToast('Personagem salvo no perfil');
    } catch {
      setToast('Não foi possível salvar o personagem');
    } finally {
      setProfileSaving(false);
    }
  };
  const shareCard = async () => {
    if (!selectedHunt || !cardRef.current) return;
    try {
      const uri = await captureRef(cardRef, { format:'png', quality:1, result:Platform.OS==='web'?'data-uri':'tmpfile' });
      if (Platform.OS === 'web') {
        const filePart = selectedHunt.location.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase() || 'hunt';
        const link = document.createElement('a');
        link.href = uri;
        link.download = `huntlog-${filePart}-${selectedHunt.date}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setToast('Imagem PNG baixada. Anexe o arquivo no WhatsApp.');
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) { Alert.alert('Compartilhamento indisponível', 'Este dispositivo não oferece compartilhamento de arquivos.'); return; }
      await Sharing.shareAsync(uri, { mimeType:'image/png', dialogTitle:'Compartilhar hunt' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente em instantes.';
      if (Platform.OS === 'web') {
        setFormErrorTitle('Não foi possível gerar a imagem PNG');
        setFormError(message);
      } else Alert.alert('Não foi possível gerar a imagem', message);
    }
  };

  const Header = ({eyebrow, title, right}: {eyebrow:string; title:string; right?:React.ReactNode}) => <View style={s.header}><View><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text></View>{right}</View>;
  const Stat = ({label,value,icon,color,sub}: {label:string;value:string;icon:React.ReactNode;color:string;sub?:string}) => <View style={s.stat}><View style={[s.statIcon,{backgroundColor:`${color}16` }]}>{icon}</View><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text>{sub ? <Text style={s.statSub}>{sub}</Text> : null}</View>;
  const HuntRow = ({h, selectable=false}: {h:Hunt; selectable?:boolean}) => { const estimate=estimateHuntValueInReal(h.loot-h.supplies,currentTcRates); const checked=selectedHuntIds.has(Number(h.id)); return <View style={s.huntRow}>{selectable&&selectionMode?<Pressable accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={`Selecionar hunt ${h.location}`} style={[s.selectHuntButton,checked&&s.selectHuntButtonActive]} onPress={()=>setSelectedHuntIds(current=>{const next=new Set(current);if(next.has(Number(h.id)))next.delete(Number(h.id));else next.add(Number(h.id));return next;})}>{checked&&<Check size={15} color={C.bg}/>}</Pressable>:null}<Pressable style={s.rowMain} onPress={()=>selectionMode&&selectable?setSelectedHuntIds(current=>{const next=new Set(current);if(next.has(Number(h.id)))next.delete(Number(h.id));else next.add(Number(h.id));return next;}):openDetails(h)}><View style={s.rowMark}><Swords size={17} color={C.lime}/></View><View style={{flex:1}}><Text style={s.rowTitle} numberOfLines={1}>{h.location}</Text><Text style={s.rowMeta}>{h.character} · {h.vocation} · {dateLabel(h.date)}</Text></View><View style={s.rowNumbers}><Text style={[s.rowGain,{color:h.loot-h.supplies>=0?C.green:C.red}]}>{money(h.loot-h.supplies)}</Text><Text style={s.rowMeta}>{xpShort(h.xp)} XP</Text><Text style={s.rowReal}>{estimate.gpPerTc>0?`${localizedAmount(estimate.tcEquivalent,2)} TC · ${estimate.realValue===null?'—':formatCompactReais(estimate.realValue)}`:'Configure cotação'}</Text></View><ChevronRight size={16} color={C.muted} style={{marginLeft:6}}/></Pressable>{!selectionMode&&<Pressable accessibilityRole="button" accessibilityLabel={`Apagar hunt ${h.location}`} hitSlop={10} style={s.deleteButton} onPress={()=>remove(h)}><Trash2 size={16} color={C.red}/></Pressable>}</View>; };
  const PeriodSelector = ({value,onChange}: {value:HuntPeriod;onChange:(value:HuntPeriod)=>void}) => <View style={s.periods}>{(['1d','7d','30d','all'] as const).map((periodOption,index)=><Pressable key={periodOption} style={[s.period,s.periodCompact,value===periodOption&&s.periodActive]} onPress={()=>onChange(periodOption)}><Text style={[s.periodText,s.periodTextCompact,value===periodOption&&s.periodTextActive]}>{['HOJE','7 DIAS','30 DIAS','TUDO'][index]}</Text></Pressable>)}</View>;
  const HuntFilters = ({query,onQuery,selectedPeriod,onPeriod,exactDate,onDate}: {query:string;onQuery:(value:string)=>void;selectedPeriod:HuntPeriod;onPeriod:(value:HuntPeriod)=>void;exactDate:string;onDate:(value:string)=>void}) => <View style={s.filters}><View style={s.searchBox}><Search size={16} color={C.muted}/><TextInput value={query} onChangeText={onQuery} placeholder="Buscar por hunt ou personagem" placeholderTextColor="#64747D" style={s.searchInput} returnKeyType="search"/></View><PeriodSelector value={selectedPeriod} onChange={onPeriod}/><View style={s.dateFilter}><CalendarDays size={15} color={C.muted}/><TextInput value={exactDate} onChangeText={onDate} placeholder="Data exata AAAA-MM-DD" placeholderTextColor="#64747D" style={s.searchInput} autoCapitalize="none"/><Pressable onPress={()=>onDate('')} hitSlop={8}><X size={15} color={C.muted}/></Pressable></View></View>;

  const Home = () => <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <Header eyebrow="SEU DIÁRIO DE AVENTURAS" title="Boa caçada, Tibiano." right={<View style={s.levelBadge}><Crown size={15} color={C.orange}/><Text style={s.levelBadgeText}>{hunts.length} HUNTS</Text></View>} />
    <Pressable style={s.profileCard} onPress={openNew}>
      <View style={s.profileIcon}><Crown size={17} color={C.orange}/></View>
      <View style={{flex:1}}>
        <Text style={s.profileLabel}>PERSONAGEM PRINCIPAL</Text>
        <Text style={s.profileName}>{primaryCharacter?.name ?? 'Defina sua personagem'}</Text>
        <Text style={s.profileMeta}>{primaryCharacter ? `${primaryCharacter.vocation} · LVL ${primaryCharacter.level} · ${xpShort(primaryCharacter.registeredXp)} XP registrada` : 'Toque para cadastrar nome, vocação e level'}</Text>
      </View>
      <ChevronRight size={17} color={C.muted}/>
    </Pressable>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>RESUMO DO PERÍODO</Text><Text style={s.sectionNote}>{period==='1d'?'Hoje':period==='7d'?'Últimos 7 dias':period==='30d'?'Últimos 30 dias':'Todo o histórico'}</Text></View>
    <PeriodSelector value={period} onChange={setPeriod}/>
    <LinearGradient colors={['#192D31','#112329','#121D26']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.hero}>
      <View style={s.heroTop}><View style={s.live}><View style={s.liveDot}/><Text style={s.liveText}>SEU PROGRESSO</Text></View><Sparkles size={17} color={C.lime}/></View>
      <Text style={s.heroLabel}>LUCRO NO PERÍODO</Text><Text style={s.heroAmount}>{money(reportTotals.profit)}</Text>
      <View style={s.heroRealRow}><View><Text style={s.heroRealLabel}>TC ESTIMADAS · VALOR EM REAIS</Text><Text style={s.heroRealAmount}>{huntTcEquivalent>0?`${localizedAmount(huntTcEquivalent,2)} TC · ${huntRealEstimate===null?'Configure as faixas':formatCompactReais(huntRealEstimate)}`:'Sem lucro no período selecionado'}</Text></View><View style={s.heroRealIcon}><Coins size={17} color={C.green}/></View></View>
      <View style={s.heroDivider}/><View style={s.heroFoot}><View style={s.heroMetric}><Zap size={14} color={C.cyan}/><Text style={s.heroMetricText}>{xpShort(reportTotals.xp)} XP</Text></View><View style={s.heroMetric}><Activity size={14} color={C.orange}/><Text style={s.heroMetricText}>{(reportTotals.minutes/60).toFixed(1).replace('.',',')}h caçadas</Text></View><Text style={s.heroHint}>{period==='1d'?'HOJE':period==='7d'?'7 DIAS':period==='30d'?'30 DIAS':'TUDO'}</Text></View>
      <View style={s.heroGlow}/>
    </LinearGradient>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>ACUMULADO DESDE O INÍCIO</Text><Text style={s.sectionNote}>{hunts.length} hunts</Text></View>
    <View style={s.statsGrid}><Stat label="EXPERIÊNCIA" value={xpShort(allTotals.xp)} icon={<Zap size={17} color={C.cyan}/>} color={C.cyan} sub="XP acumulada"/><Stat label="LOOT" value={xpShort(allTotals.loot)} icon={<Coins size={17} color={C.orange}/>} color={C.orange} sub="bruto coletado"/><Stat label="SUPPLIES" value={xpShort(allTotals.supplies)} icon={<ArrowDownLeft size={17} color={C.red}/>} color={C.red} sub="gasto total"/><Stat label="LUCRO LÍQUIDO" value={xpShort(allTotals.profit)} icon={<TrendingUp size={17} color={C.green}/>} color={C.green} sub="loot − supplies"/><Stat label="TC ESTIMADAS" value={localizedAmount(lifetimeTcEquivalent,2)} icon={<Coins size={17} color={C.lime}/>} color={C.lime} sub="GP convertido em TC"/><Stat label="VALOR ESTIMADO" value={lifetimeRealEstimate===null?'—':formatCompactReais(lifetimeRealEstimate)} icon={<TrendingUp size={17} color={C.green}/>} color={C.green} sub="soma por hunt"/></View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>MINHAS HUNTS</Text><View style={s.inlineActions}><Text style={s.sectionNote}>{huntList.length} encontradas</Text><Pressable accessibilityRole="button" accessibilityLabel="Atualizar lista de hunts" disabled={refreshingHunts} onPress={()=>void refreshHuntsNow()} style={s.refreshButton}><RefreshCw size={14} color={C.lime}/></Pressable></View></View>
    {HuntFilters({query:huntQuery,onQuery:setHuntQuery,selectedPeriod:huntPeriod,onPeriod:setHuntPeriod,exactDate:huntDate,onDate:setHuntDate})}
    {huntList.length ? <View style={s.card}>{huntList.map((h,i)=><View key={h.id}>{i>0&&<View style={s.separator}/>}<HuntRow h={h}/></View>)}</View> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>{hunts.length?'Nenhuma hunt corresponde à busca.':'Seu grimório está em branco.'}</Text>{!hunts.length&&<Pressable onPress={openNew}><Text style={s.link}>REGISTRAR PRIMEIRA HUNT</Text></Pressable>}</View>}
    <Pressable style={s.bigAdd} onPress={openNew}><LinearGradient colors={[C.lime,'#9FDF4E']} style={s.bigAddGradient}><Plus size={20} color={C.bg}/><Text style={s.bigAddText}>REGISTRAR NOVA HUNT</Text><ChevronRight size={18} color={C.bg}/></LinearGradient></Pressable>
    <Text style={s.tip}>TOQUE NA HUNT PARA EDITAR · USE A LIXEIRA PARA APAGAR</Text>
  </ScrollView>;

  const Hunts = () => <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <Header eyebrow="SEU GRIMÓRIO DE AVENTURAS" title="Minhas Hunts" right={<Pressable accessibilityRole="button" accessibilityLabel="Atualizar lista de hunts" disabled={refreshingHunts} onPress={()=>void refreshHuntsNow()} style={s.roundIcon}><RefreshCw size={18} color={C.lime}/></Pressable>} />
    <View style={s.huntLibraryIntro}><Text style={s.huntLibraryTitle}>{hunts.length} {hunts.length===1?'hunt registrada':'hunts registradas'}</Text><Text style={s.huntLibrarySubtitle}>Toque em uma sessão para ver todos os detalhes. A edição fica dentro da ficha.</Text></View>
    <View style={s.selectionToolbar}><Pressable style={[s.selectionAction,selectionMode&&s.selectionActionActive]} onPress={()=>{setSelectionMode(value=>!value);setSelectedHuntIds(new Set());}}><Text style={[s.selectionActionText,selectionMode&&s.selectionActionTextActive]}>{selectionMode?'Cancelar seleção':'Selecionar hunts'}</Text></Pressable>{selectionMode&&<><Pressable style={s.selectionAction} onPress={()=>setSelectedHuntIds(new Set(sortedHuntList.map(h=>Number(h.id))))}><Text style={s.selectionActionText}>Selecionar filtradas</Text></Pressable><Pressable disabled={!selectedHuntIds.size} style={[s.selectionAction,s.selectionDelete,!selectedHuntIds.size&&s.selectionDisabled]} onPress={removeSelected}><Text style={[s.selectionActionText,s.selectionDeleteText]}>{`Apagar (${selectedHuntIds.size})`}</Text></Pressable></>}</View>
    {HuntFilters({query:huntQuery,onQuery:setHuntQuery,selectedPeriod:huntPeriod,onPeriod:setHuntPeriod,exactDate:huntDate,onDate:setHuntDate})}
    <View style={s.sortHeader}><Text style={s.sectionTitle}>ORDENAR POR</Text><View style={s.sortChoices}>{([
      ['recent','RECENTES'],['profit','LUCRO'],['xp','XP'],['xpHour','XP/H'],
    ] as const).map(([id,label])=><Pressable key={id} onPress={()=>setHuntSort(id)} style={[s.sortChip,huntSort===id&&s.sortChipActive]}><Text style={[s.sortChipText,huntSort===id&&s.sortChipTextActive]}>{label}</Text></Pressable>)}</View></View>
    {sortedHuntList.length ? <View style={s.card}>{sortedHuntList.map((h,i)=><View key={h.id}>{i>0&&<View style={s.separator}/>}<HuntRow h={h} selectable/></View>)}</View> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>{hunts.length?'Nenhuma hunt corresponde aos filtros.':'Você ainda não registrou hunts.'}</Text>{!hunts.length&&<Pressable onPress={openNew}><Text style={s.link}>REGISTRAR PRIMEIRA HUNT</Text></Pressable>}</View>}
    {!!hunts.length&&<Pressable style={s.clearHistoryButton} onPress={clearHistory}><Trash2 size={15} color={C.red}/><Text style={s.clearHistoryText}>ZERAR HISTÓRICO · APAGAR TODAS AS HUNTS</Text></Pressable>}
    <Pressable style={s.bigAdd} onPress={openNew}><LinearGradient colors={[C.lime,'#9FDF4E']} style={s.bigAddGradient}><Plus size={20} color={C.bg}/><Text style={s.bigAddText}>REGISTRAR NOVA HUNT</Text><ChevronRight size={18} color={C.bg}/></LinearGradient></Pressable>
  </ScrollView>;

  const Performance = () => {
    const best = performanceScored[0];
    const worst = performanceScored[performanceScored.length-1];
    const improvement = performanceAverage ? ((best?.value ?? 0)-performanceAverage)/Math.abs(performanceAverage)*100 : 0;
    const metricLabels: Record<PerformanceMetric,string> = {profit:'Lucro total',xp:'XP total',xpHour:'XP por hora',profitHour:'Lucro por hora'};
    return <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Header eyebrow="COMPARE SUAS SESSÕES" title="Desempenho" right={<View style={s.roundIcon}><BarChart3 size={19} color={C.cyan}/></View>} />
      <Text style={s.performanceIntro}>Veja quais hunts renderam mais lucro e experiência. Os destaques consideram apenas as sessões filtradas.</Text>
      {HuntFilters({query:huntQuery,onQuery:setHuntQuery,selectedPeriod:huntPeriod,onPeriod:setHuntPeriod,exactDate:huntDate,onDate:setHuntDate})}
      <View style={s.metricPicker}>{([
        ['profitHour','LUCRO/H'],['xpHour','XP/H'],['profit','LUCRO TOTAL'],['xp','XP TOTAL'],
      ] as const).map(([id,label])=><Pressable key={id} onPress={()=>setPerformanceMetric(id)} style={[s.sortChip,s.metricChip,performanceMetric===id&&s.sortChipActive]}><Text style={[s.sortChipText,performanceMetric===id&&s.sortChipTextActive]}>{label}</Text></Pressable>)}</View>
      {performanceScored.length ? <>
        <View style={s.performanceSummary}><View style={s.averageLine}><Text style={s.averageLabel}>MÉDIA · {metricLabels[performanceMetric].toUpperCase()}</Text><Text style={s.averageValue}>{performanceNumber(performanceAverage,performanceMetric)}</Text></View><Text style={s.averageHint}>{performanceScored.length===1?'Registre outra hunt para comparar com essa sessão.':`${performanceScored.length} sessões comparadas pelos filtros atuais.`}</Text></View>
        <View style={s.performanceHighlights}>
          <Pressable onPress={()=>best&&openDetails(best.hunt)} style={[s.performanceHighlight,s.bestHighlight]}><View style={s.highlightHeader}><Trophy size={16} color={C.lime}/><Text style={s.highlightEyebrow}>MELHOR</Text></View><Text numberOfLines={1} style={s.highlightLocation}>{best?.hunt.location}</Text><Text style={s.highlightMeta}>{best?.hunt.character} · {dateLabel(best?.hunt.date ?? today())}</Text><Text style={s.highlightValue}>{performanceNumber(best?.value??0,performanceMetric)}</Text><Text style={s.highlightCompare}>{performanceScored.length>1?`${improvement>=0?'+':''}${improvement.toFixed(0)}% vs média`: 'Sua sessão registrada'}</Text></Pressable>
          <Pressable onPress={()=>worst&&openDetails(worst.hunt)} style={[s.performanceHighlight,s.worstHighlight]}><View style={s.highlightHeader}><TrendingUp size={16} color={C.orange} style={{transform:[{rotate:'180deg'}]}}/><Text style={s.highlightEyebrow}>PRECISA DE ATENÇÃO</Text></View><Text numberOfLines={1} style={s.highlightLocation}>{worst?.hunt.location}</Text><Text style={s.highlightMeta}>{worst?.hunt.character} · {dateLabel(worst?.hunt.date ?? today())}</Text><Text style={s.highlightValue}>{performanceNumber(worst?.value??0,performanceMetric)}</Text><Text style={s.highlightCompare}>{performanceScored.length>1?'Menor resultado no período':'Ainda sem comparação'}</Text></Pressable>
        </View>
        <View style={s.performanceListHeader}><Text style={s.sectionTitle}>RANKING DE HUNTS</Text><Text style={s.sectionNote}>{metricLabels[performanceMetric]}</Text></View>
        {performanceScored.map((row,index)=>{const difference=performanceAverage?((row.value-performanceAverage)/Math.abs(performanceAverage))*100:0;return <Pressable key={row.hunt.id} onPress={()=>openDetails(row.hunt)} style={s.rankRow}><View style={[s.rankNumber,index===0&&s.rankNumberBest]}><Text style={[s.rankNumberText,index===0&&s.rankNumberTextBest]}>{index+1}</Text></View><View style={s.rankBody}><View style={s.rankTitleLine}><Text numberOfLines={1} style={s.rankTitle}>{row.hunt.location}</Text><Text style={s.rankValue}>{performanceNumber(row.value,performanceMetric)}</Text></View><Text style={s.rankMeta}>{row.hunt.character} · {row.hunt.vocation} · {dateLabel(row.hunt.date)} · {row.hunt.duration} min</Text><View style={s.rankTrack}><View style={[s.rankFill,{width:`${performanceAverage?Math.min(100,Math.max(5,(row.value/Math.max(...performanceScored.map(item=>item.value),1))*100)):5}%` as any},difference<0&&s.rankFillLow]}/></View><Text style={[s.rankCompare,difference>=0?s.rankCompareGood:s.rankCompareLow]}>{difference>=0?`${difference.toFixed(0)}% acima`:`${Math.abs(difference).toFixed(0)}% abaixo`} da média</Text></View></Pressable>})}
      </> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>{hunts.length?'Nenhuma hunt corresponde aos filtros.':'Registre uma hunt para começar a comparar seu desempenho.'}</Text>{!hunts.length&&<Pressable onPress={openNew}><Text style={s.link}>REGISTRAR PRIMEIRA HUNT</Text></Pressable>}</View>}
    </ScrollView>;
  };

  const Reports = () => <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <Header eyebrow="NÚMEROS DA SUA JORNADA" title="Relatórios" right={<View style={s.roundIcon}><ScrollText size={19} color={C.cyan}/></View>} />
    <PeriodSelector value={period} onChange={setPeriod}/>
    <Pressable disabled={reportExporting||!filtered.length} onPress={exportReport} style={[s.reportExportButton,(!filtered.length||reportExporting)&&s.reportExportButtonDisabled]}><FileSpreadsheet size={17} color={C.lime}/><Text style={s.reportExportText}>{reportExporting?'GERANDO ARQUIVO…':'EXPORTAR RELATÓRIO EXCEL (.XLSX)'}</Text></Pressable>
    {reportExportError?<Text style={s.reportExportError}>{reportExportError}</Text>:null}
    <View style={s.reportHero}><View><Text style={s.reportLabel}>LUCRO LÍQUIDO</Text><Text style={s.reportProfit}>{money(reportTotals.profit)}</Text><View style={s.profitTag}><ArrowUpRight size={13} color={C.green}/><Text style={s.profitTagText}>NO PERÍODO SELECIONADO</Text></View></View><View style={s.reportHeroIcon}><TrendingUp size={22} color={C.green}/></View></View>
    <View style={s.reportGrid}><View style={s.reportTile}><Zap size={16} color={C.cyan}/><Text style={s.tileLabel}>XP TOTAL</Text><Text style={s.tileValue}>{xpShort(reportTotals.xp)}</Text></View><View style={s.reportTile}><Coins size={16} color={C.orange}/><Text style={s.tileLabel}>LOOT BRUTO</Text><Text style={s.tileValue}>{money(reportTotals.loot)}</Text></View><View style={s.reportTile}><Swords size={16} color={C.lime}/><Text style={s.tileLabel}>SESSÕES</Text><Text style={s.tileValue}>{filtered.length}</Text></View><View style={s.reportTile}><Timer size={16} color={C.cyan}/><Text style={s.tileLabel}>TEMPO DE HUNT</Text><Text style={s.tileValue}>{Math.floor(reportTotals.minutes/60)}h {reportTotals.minutes%60}m</Text></View></View>
    <View style={s.tcRateCard}>
      <View style={s.tcRateHeading}><Coins size={16} color={C.lime}/><Text style={s.tcRateTitle}>VALOR DAS HUNTS EM REAIS</Text></View>
      <Text style={s.tcRateHint}>Cotação: {tcRateGpPerTc>0?`1 TC = ${gpAmountDisplay(tcRateGpPerTc)} GP`:'configure GP/25 TC'} · cada hunt usa sua faixa correspondente, proporcional ao tamanho do pacote.</Text>
      <View style={s.tcRateResult}><Text style={s.tcRateResultLabel}>TOTAL ESTIMADO DAS HUNTS NO PERÍODO</Text><Text style={s.tcRateResultValue}>{huntRealEstimate===null?'Configure as taxas acima':formatCompactReais(huntRealEstimate)}</Text><Text style={s.tcRateResultMeta}>{huntRealEstimate===null?`${money(reportTotals.profit)} · lucro líquido no período selecionado`:`${huntEstimates.length} hunts · ${localizedAmount(huntTcEquivalent,2)} TC equivalentes somados · estimativa de cada hunt somada`}</Text></View>
      <View style={s.reportHuntList}><Text style={s.reportHuntListTitle}>ESTIMATIVA POR HUNT</Text>{huntEstimates.length?huntEstimates.map(({hunt,estimate})=><View key={hunt.id} style={s.reportHuntRow}><View style={s.reportHuntTop}><Text numberOfLines={1} style={s.reportHuntName}>{hunt.location} · {dateLabel(hunt.date)}</Text><Text style={s.reportHuntAmount}>{estimate.realValue===null?'—':formatCompactReais(estimate.realValue)}</Text></View><Text style={s.reportHuntMeta}>{gpAmountDisplay(hunt.loot-hunt.supplies)} GP → {estimate.gpPerTc>0?`${localizedAmount(estimate.tcEquivalent,2)} TC`: 'configure cotação'}{estimate.priceTier?` · ${localizedAmount(estimate.packageCount,2)} pacotes equivalentes de ${n(estimate.priceTier.lotTc)} TC × ${formatCompactReais(estimate.priceTier.realPrice)}`:''}</Text></View>):<Text style={s.reportHuntMeta}>Nenhuma hunt neste período.</Text>}</View>
      <Pressable onPress={()=>navigate('calculator')} style={s.calculatorReportsLink}><Text style={s.link}>ABRIR CALCULADORA DE TC</Text><ChevronRight size={14} color={C.lime}/></Pressable>
    </View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>XP NOS ÚLTIMOS 7 DIAS</Text><Text style={s.chartLegend}><View style={s.legendDot}/> XP</Text></View>
    <View style={s.chartCard}><View style={s.chartBars}>{daily.map((d,i)=><View style={s.barColumn} key={d.date}><Text style={s.barValue}>{d.xp?xpShort(d.xp):''}</Text><View style={s.barTrack}><LinearGradient colors={i===6?['#D5FF8D',C.lime]:['#4AA2AC','#377B87']} style={[s.bar,{height:`${Math.max(5, Math.round((d.xp/maxDaily)*100))}%` as any}]}/></View><Text style={s.barDate}>{toDate(d.date).toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</Text></View>)}</View></View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>HISTÓRICO DE HUNTS</Text><Text style={s.sectionNote}>{filtered.length} sessões</Text></View>
    {filtered.length ? <View style={s.card}>{filtered.map((h,i)=><View key={h.id}>{i>0&&<View style={s.separator}/>}<HuntRow h={h}/></View>)}</View> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>Nenhuma hunt neste período.</Text><Pressable onPress={openNew}><Text style={s.link}>REGISTRAR PRIMEIRA HUNT</Text></Pressable></View>}
  </ScrollView>;

  const Calculator = () => <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Header eyebrow="VENDA DE TIBIA COINS" title="Calculadora" right={<View style={s.roundIcon}><CalculatorIcon size={19} color={C.lime}/></View>} />
    <Text style={s.calculatorIntro}>Cadastre seus preços de venda e veja quanto recebe por qualquer quantidade de TC.</Text>
    <View style={[s.tcRateCard,desktop&&s.calculatorConfigDesktop]}>
      <View style={s.tcRateHeading}><Coins size={17} color={C.lime}/><Text style={s.tcRateTitle}>SEUS VALORES</Text></View>
      <Text style={s.tcRateHint}>A cotação é o preço total de 25 TC em GP. Configure abaixo quanto recebe por pacote em cada faixa.</Text>
      <View style={[s.saleTierFields,desktop&&s.saleTierFieldsDesktop]}>
        <View style={s.tierField}><Text style={s.tcRateLabel}>PREÇO TOTAL DE 25 TC NO TIBIA (GP)</Text><TextInput value={tcGpAmount} onChangeText={setTcGpAmount} placeholder="Ex.: 48.701" placeholderTextColor="#64747D" keyboardType="numeric" style={s.tcRateInput}/><Text style={s.tcRateHint}>Cotação por TC: {gpAmountDisplay(asDecimal(tcGpAmount)/25)} GP</Text></View>
      </View>
      <Text style={[s.tcRateLabel,{marginTop:12,marginBottom:8}]}>FAIXAS DE VENDA</Text>
      {sellTiers.map((tier,index)=><View key={index} style={[s.saleTierRow,desktop&&s.saleTierRowDesktop]}>
        <View style={s.saleTierInput}><Text style={s.tcRateLabel}>MÍNIMO DA VENDA (TC)</Text><TextInput value={String(tier.minimumTc)} onChangeText={value=>setSellTiers(current=>current.map((item,i)=>i===index?{...item,minimumTc:asInteger(value)}:item))} keyboardType="numeric" style={s.tcRateInput}/></View>
        <View style={s.saleTierInput}><Text style={s.tcRateLabel}>TC POR PACOTE</Text><TextInput value={String(tier.lotTc)} onChangeText={value=>setSellTiers(current=>current.map((item,i)=>i===index?{...item,lotTc:asInteger(value)}:item))} keyboardType="numeric" style={s.tcRateInput}/></View>
        <View style={s.saleTierInput}><Text style={s.tcRateLabel}>R$ POR PACOTE</Text><TextInput value={localizedAmount(tier.realPrice,2)} onChangeText={value=>setSellTiers(current=>current.map((item,i)=>i===index?{...item,realPrice:asDecimal(value)}:item))} keyboardType="decimal-pad" style={s.tcRateInput}/></View>
        <Pressable accessibilityLabel="Remover faixa" onPress={()=>setSellTiers(current=>current.filter((_,i)=>i!==index))} style={s.removeTier}><X size={16} color={C.red}/></Pressable>
      </View>)}
      <Pressable onPress={()=>setSellTiers(current=>[...current,{minimumTc:current.length?Math.max(...current.map(tier=>tier.minimumTc))+1:25,lotTc:250,realPrice:0}])} style={s.addTier}><Plus size={15} color={C.lime}/><Text style={s.addTierText}>ADICIONAR FAIXA</Text></Pressable>
    </View>
    <View style={[s.tcRateCard,desktop&&s.calculatorConfigDesktop]}>
      <View style={s.tcRateHeading}><CalculatorIcon size={17} color={C.lime}/><Text style={s.tcRateTitle}>SIMULAR UMA VENDA</Text></View>
      <Text style={s.tcRateHint}>Informe quantos TC vai vender. Veja o total em reais e quantos GP custam esses TC no Tibia.</Text>
      <View style={s.tcRateField}><Text style={s.tcRateLabel}>QUANTAS TC VOCÊ VAI VENDER?</Text><TextInput value={calculatorTcAmount} onChangeText={setCalculatorTcAmount} placeholder="Ex.: 250" placeholderTextColor="#64747D" keyboardType="decimal-pad" style={s.tcRateInput}/></View>
      <View style={s.tcPresets}>{[25,250,5000,10000].map(value=><Pressable key={value} onPress={()=>setCalculatorTcAmount(String(value))} style={[s.tcPreset,calculatorTc===value&&s.tcPresetActive]}><Text style={[s.tcPresetText,calculatorTc===value&&s.tcPresetTextActive]}>{value>=1000?(value/1000)+'k':value} TC</Text></Pressable>)}</View>
      <View style={s.saleResultCard}>
        <Text style={s.tcRateResultLabel}>VOCÊ RECEBE APROXIMADAMENTE</Text>
        <Text style={s.saleResultValue}>{calculatorTrade.saleRevenue!==null?formatCompactReais(calculatorTrade.saleRevenue):'Configure uma faixa para esta quantidade'}</Text>
        <Text style={s.tcRateResultMeta}>{calculatorTrade.priceTier?`${localizedAmount(calculatorTrade.packageCount,2)} pacotes equivalentes de ${n(calculatorTrade.priceTier.lotTc)} TC · ${localizedAmount(calculatorTrade.soldTc,2)} TC considerados · ${formatCompactReais(calculatorTrade.priceTier.realPrice)} por pacote`:'Não há faixa configurada para essa quantidade.'}</Text>
        {tcRateGpPerTc>0&&<View style={s.saleGpLine}><Text style={s.saleGpLabel}>GP necessários para obter {n(calculatorTc)} TC</Text><Text style={s.saleGpValue}>{gpAmountDisplay(Math.round(calculatorGpValue))} GP</Text></View>}
      </View>
    </View>
  </ScrollView>;
  const Share = () => <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <Header eyebrow="MOSTRE SUA EVOLUÇÃO" title="Compartilhar" right={<View style={s.roundIcon}><Share2 size={19} color={C.lime}/></View>} />
    <Text style={s.shareIntro}>Gere um card da sua sessão e compartilhe com sua guilda.</Text>
    {hunts.length ? <>
      <View style={s.pickRow}><Text style={s.sectionTitle}>ESCOLHA UMA HUNT</Text><View style={s.pickCount}><Text style={s.pickCountText}>{shareList.length} encontradas</Text></View></View>
      {HuntFilters({query:shareQuery,onQuery:setShareQuery,selectedPeriod:sharePeriod,onPeriod:setSharePeriod,exactDate:shareDate,onDate:setShareDate})}
      {shareList.length ? <View style={s.card}>{shareList.map((h,i)=><View key={h.id}>{i>0&&<View style={s.separator}/>}<Pressable style={[s.shareHuntRow,selected===h.id&&s.shareHuntRowActive]} onPress={()=>setSelected(h.id)}><View style={s.rowMark}><Swords size={16} color={selected===h.id?C.lime:C.muted}/></View><View style={{flex:1}}><Text numberOfLines={1} style={s.rowTitle}>{h.location}</Text><Text style={s.rowMeta}>{h.character} · {dateLabel(h.date)}</Text></View><View style={{alignItems:'flex-end'}}><Text style={[s.rowGain,{color:h.loot-h.supplies>=0?C.green:C.red}]}>{money(h.loot-h.supplies)}</Text><Text style={s.rowMeta}>{xpShort(h.xp)} XP</Text></View><ChevronRight size={16} color={C.muted} style={{marginLeft:8}}/></Pressable></View>)}</View> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>Nenhuma hunt corresponde à busca.</Text></View>}
      {selectedHunt && <View ref={cardRef} collapsable={false} style={s.shareCard}>
        <LinearGradient colors={['#1C3430','#14252C','#101A26']} style={StyleSheet.absoluteFill}/>
        <View style={s.cardOrnament}/><View style={s.shareCardHeader}><View style={s.brandMark}><Swords size={17} color={C.bg}/></View><View><Text style={s.brandName}>HUNTLOG <Text style={{color:C.lime}}>TIBIA</Text></Text><Text style={s.brandSub}>DIÁRIO DE AVENTURAS</Text></View><View style={s.cardDate}><CalendarDays size={12} color={C.muted}/><Text style={s.cardDateText}>{dateLabel(selectedHunt.date)}</Text></View></View>
        <View style={s.cardRule}/><View style={s.cardLocLine}><MapPin size={14} color={C.lime}/><Text style={s.cardLocation}>{selectedHunt.location}</Text></View><Text style={s.cardChar}>{selectedHunt.character} <Text style={s.cardCharMuted}>· {selectedHunt.vocation} · LVL {selectedHunt.level||'—'}</Text></Text>
        <View style={s.cardStats}><View style={s.cardStat}><Text style={s.cardStatLabel}>EXPERIÊNCIA</Text><Text style={[s.cardStatValue,{color:C.cyan}]}>{xpShort(selectedHunt.xp)}</Text><Text style={s.cardStatUnit}>XP</Text></View><View style={s.cardStatDivider}/><View style={s.cardStat}><Text style={s.cardStatLabel}>LUCRO LÍQUIDO</Text><Text style={[s.cardStatValue,{color:selectedHunt.loot-selectedHunt.supplies>=0?C.green:C.red}]}>{money(selectedHunt.loot-selectedHunt.supplies)}</Text><Text style={s.cardStatUnit}>GP</Text></View></View>
        <View style={s.cardCoinStats}><View style={s.cardStat}><Text style={s.cardStatLabel}>TC ESTIMADAS</Text><Text style={[s.cardCoinValue,{color:C.lime}]}>{selectedHuntEstimate&&selectedHuntEstimate.gpPerTc>0?localizedAmount(selectedHuntEstimate.tcEquivalent,2):'—'}</Text><Text style={s.cardStatUnit}>TC</Text></View><View style={s.cardStatDivider}/><View style={s.cardStat}><Text style={s.cardStatLabel}>VALOR ESTIMADO</Text><Text style={[s.cardCoinValue,{color:C.green}]}>{selectedHuntEstimate?.realValue===null||!selectedHuntEstimate? 'Configure a faixa':formatCompactReais(selectedHuntEstimate.realValue)}</Text><Text style={s.cardStatUnit}>{selectedHuntEstimate?.priceTier?`${n(selectedHuntEstimate.priceTier.lotTc)} TC · ${formatCompactReais(selectedHuntEstimate.priceTier.realPrice)} / pacote`:'CADASTRE UMA FAIXA'}</Text></View></View>
        <View style={s.cardBreakdown}><View><Text style={s.cardBreakLabel}>LOOT</Text><Text style={s.cardBreakValue}>{money(selectedHunt.loot)}</Text></View><Text style={s.cardMinus}>−</Text><View><Text style={s.cardBreakLabel}>SUPPLIES</Text><Text style={s.cardBreakValue}>{money(selectedHunt.supplies)}</Text></View><View style={s.cardDuration}><Timer size={13} color={C.orange}/><Text style={s.cardDurationText}>{selectedHunt.duration} MIN</Text></View></View>
        {selectedHunt.session&&<>
          <View style={[s.cardRule,s.sessionRule]}/>
          <View style={s.sessionTime}><CalendarDays size={13} color={C.cyan}/><Text style={s.sessionTimeText}>INÍCIO {selectedHunt.session.startedAt}  ·  FIM {selectedHunt.session.endedAt}</Text></View>
          <View style={s.sessionMetricGrid}>{[
            ['XP BRUTO',selectedHunt.session.rawXpGain],['XP/H',selectedHunt.session.xpPerHour],['XP BRUTO/H',selectedHunt.session.rawXpPerHour],['BALANCE',selectedHunt.session.balance],['DANO',selectedHunt.session.damage],['DANO/H',selectedHunt.session.damagePerHour],['CURA',selectedHunt.session.healing],['CURA/H',selectedHunt.session.healingPerHour],
          ].map(([label,value])=><View key={String(label)} style={s.sessionMetric}><Text style={s.sessionLabel}>{label}</Text><Text style={s.sessionValue}>{formatCompactNumber(Number(value))}</Text></View>)}</View>
          <View style={s.sessionLists}>
            <View style={s.sessionListPanel}><Text style={s.sessionSectionTitle}>MONSTROS ABATIDOS · {n(selectedHunt.session.monsters.reduce((sum,item)=>sum+item.count,0))}</Text>{selectedHunt.session.monsters.map((item,index)=><View key={`${item.name}-${index}`} style={s.sessionEntityRow}><Text style={s.sessionCount}>{n(item.count)}×</Text><Text style={s.sessionEntityName}>{item.name}</Text></View>)}</View>
            <View style={s.sessionListPanel}><Text style={s.sessionSectionTitle}>ITENS LOOTEADOS · {selectedHunt.session.items.length} TIPOS</Text><View style={s.sessionItemsGrid}>{selectedHunt.session.items.map((item,index)=><View key={`${item.name}-${index}`} style={s.sessionItemRow}><Text style={s.sessionCount}>{n(item.count)}×</Text><Text style={s.sessionEntityName}>{item.name}</Text></View>)}</View></View>
          </View>
        </>}
        <View style={[s.cardRule,s.creditRule]}/><View style={s.cardFooter}><Text style={s.cardFooterText}>HUNT REGISTRADA NO HUNTLOG</Text><Flame size={14} color={C.orange}/></View><Text style={s.cardCredit}>DESENVOLVIDO POR <Text style={s.cardCreditName}>FALLZ DEVELOPER</Text></Text>
      </View>}
      {selectedHunt ? <><Pressable style={s.shareButton} onPress={shareCard}><LinearGradient colors={[C.lime,'#9FDF4E']} style={s.bigAddGradient}><ImageIcon size={18} color={C.bg}/><Text style={s.bigAddText}>{desktop?'BAIXAR IMAGEM PNG':'GERAR E COMPARTILHAR IMAGEM'}</Text><Share2 size={17} color={C.bg}/></LinearGradient></Pressable><Text style={s.shareFootnote}>{desktop?'PNG BAIXADO EM DOWNLOADS · PRONTO PARA ANEXAR NO WHATSAPP':'PNG · CARD PRONTO PARA WHATSAPP, DISCORD E INSTAGRAM'}</Text></> : <Text style={s.shareFootnote}>TOQUE EM UMA HUNT DA LISTA PARA ABRIR O CARD</Text>}
    </> : <View style={s.empty}><View style={s.emptyIcon}><ImageIcon size={23} color={C.muted}/></View><Text style={s.emptyTitle}>Nenhuma hunt para compartilhar</Text><Text style={s.emptyText}>Registre uma sessão para gerar seu primeiro card.</Text><Pressable style={s.emptyButton} onPress={openNew}><Plus size={15} color={C.bg}/><Text style={s.emptyButtonText}>REGISTRAR HUNT</Text></Pressable></View>}
  </ScrollView>;

  const Profile = () => <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Header eyebrow="SUA CONTA DE AVENTUREIRO" title="Perfil" right={<View style={s.roundIcon}><UserRound size={19} color={C.lime}/></View>} />
    <View style={s.profileHero}><View style={s.profileHeroIcon}><Crown size={22} color={C.orange}/></View><View style={{flex:1}}><Text style={s.profileLabel}>PERSONAGEM PRINCIPAL</Text><Text style={s.profileName}>{primaryCharacter?.name ?? 'Cadastre seu personagem'}</Text><Text style={s.profileMeta}>{primaryCharacter ? `${primaryCharacter.vocation} · LEVEL ${primaryCharacter.level}` : 'Salve nome, vocação e level para agilizar suas hunts.'}</Text></View></View>
    {primaryCharacter&&<View style={s.profileXp}><Zap size={16} color={C.cyan}/><Text style={s.profileXpText}>{xpShort(primaryCharacter.registeredXp)} XP registrada em hunts</Text></View>}
    <View style={s.tcRateCard}><View style={s.tcRateHeading}><Coins size={16} color={C.lime}/><Text style={s.tcRateTitle}>LUCRO ACUMULADO EM TC E REAIS</Text></View><Text style={s.profileCoinValue}>{lifetimeTcEquivalent>0?`${localizedAmount(lifetimeTcEquivalent,2)} TC`: 'Configure cotação e registre lucro'}</Text><Text style={s.tcRateHint}>{lifetimeRealEstimate===null?'Cadastre a cotação de 25 TC em GP e as faixas de venda na Calculadora.':`Estimativa total de ${formatCompactReais(lifetimeRealEstimate)} · soma da conversão individual de ${hunts.length} hunts.`}</Text><Pressable onPress={()=>navigate('calculator')} style={s.calculatorReportsLink}><Text style={s.link}>CONFIGURAR COTAÇÃO E FAIXAS</Text><ChevronRight size={14} color={C.lime}/></Pressable></View>
    <Text style={s.formSection}>CADASTRAR / ATUALIZAR PERSONAGEM</Text>
    <Text style={s.fieldLabel}>NOME DO PERSONAGEM</Text><TextInput value={profileName} onChangeText={setProfileName} placeholder="Ex.: Nero" placeholderTextColor="#566772" style={s.profileInput} autoCapitalize="words"/>
    <Text style={[s.fieldLabel,{marginTop:5}]}>VOCAÇÃO</Text><View style={s.vocRow}>{['EK','RP','MS','ED','Other'].map(v=><Pressable key={v} onPress={()=>setProfileVocation(v)} style={[s.vocPill,profileVocation===v&&s.vocPillActive]}><Text style={[s.vocText,profileVocation===v&&s.vocTextActive]}>{v}</Text></Pressable>)}</View>
    <Text style={s.fieldLabel}>LEVEL ATUAL</Text><TextInput value={profileLevel} onChangeText={setProfileLevel} placeholder="Ex.: 309" placeholderTextColor="#566772" style={s.profileInput} keyboardType="number-pad"/>
    <Pressable style={[s.primaryToggle,profilePrimary&&s.primaryToggleActive]} onPress={()=>setProfilePrimary(!profilePrimary)}><Crown size={16} color={profilePrimary?C.orange:C.muted}/><View style={{flex:1}}><Text style={s.primaryToggleTitle}>DEFINIR COMO PERSONAGEM PRINCIPAL</Text><Text style={s.primaryToggleHint}>Nome e level serão preenchidos nas novas hunts</Text></View><View style={[s.checkbox,profilePrimary&&s.checkboxActive]}>{profilePrimary&&<Check size={12} color={C.bg}/>}</View></Pressable>
    <Pressable disabled={profileSaving} style={[s.saveButton,profileSaving&&{opacity:.65}]} onPress={saveProfile}><LinearGradient colors={[C.lime,'#A6E454']} style={s.saveGradient}><Check size={17} color={C.bg}/><Text style={s.saveText}>{profileSaving?'SALVANDO…':'SALVAR PERSONAGEM'}</Text></LinearGradient></Pressable>
    <View style={[s.sectionHead,{marginTop:24}]}><Text style={s.sectionTitle}>PERSONAGENS SALVOS</Text><Text style={s.sectionNote}>{characters.length}</Text></View>
    {characters.length ? <View style={s.card}>{characters.map((profile,i)=><View key={profile.name}>{i>0&&<View style={s.separator}/>}<Pressable style={s.savedCharacterRow} onPress={()=>editProfile(profile)}><View style={s.rowMark}><UserRound size={16} color={profile.isPrimary?C.lime:C.muted}/></View><View style={{flex:1}}><Text style={s.rowTitle}>{profile.name}{profile.isPrimary?'  ★':''}</Text><Text style={s.rowMeta}>{profile.vocation} · LVL {profile.level} · {xpShort(profile.registeredXp)} XP</Text></View><ChevronRight size={16} color={C.muted}/></Pressable></View>)}</View> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>Seu personagem será salvo aqui.</Text></View>}
  </ScrollView>;

  const HuntDetails = () => detailHunt ? <Modal visible transparent animationType="fade" onRequestClose={()=>setDetailHuntId(null)}>
    <View style={[s.detailsShade,desktop&&s.detailsShadeDesktop]}><View style={[s.detailsModal,desktop&&s.detailsModalDesktop]}>
      <View style={s.detailsHeader}><View style={{flex:1}}><Text style={s.modalEyebrow}>FICHA DA HUNT · {dateLabel(detailHunt.date)}</Text><Text style={s.detailsTitle} numberOfLines={1}>{detailHunt.location}</Text><Text style={s.detailsSubtitle}>{detailHunt.character} · {detailHunt.vocation} · LVL {detailHunt.level||'—'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar detalhes" style={s.closeButton} onPress={()=>setDetailHuntId(null)}><X size={19} color={C.muted}/></Pressable></View>
      <ScrollView style={s.detailsScroll} showsVerticalScrollIndicator={false}>
        {(()=>{const estimate=estimateHuntValueInReal(detailHunt.loot-detailHunt.supplies,currentTcRates);return <View style={s.detailRealCard}><Text style={s.detailRealTitle}>CONVERSÃO DO LUCRO</Text><Text style={s.detailRealValue}>{estimate.realValue===null?'Configure as faixas de venda':formatCompactReais(estimate.realValue)}</Text><Text style={s.detailRealMeta}>{tcRateGpPerTc>0?`${gpAmountDisplay(detailHunt.loot-detailHunt.supplies)} GP ÷ ${gpAmountDisplay(tcRateGpPerTc)} GP/TC = ${localizedAmount(estimate.tcEquivalent,2)} TC`:'Configure a cotação de GP por 25 TC para converter o lucro.'}</Text><Text style={s.detailRealMeta}>{estimate.priceTier?`Faixa a partir de ${n(estimate.priceTier.minimumTc)} TC · ${localizedAmount(estimate.packageCount,2)} pacote(s) equivalente(s) de ${n(estimate.priceTier.lotTc)} TC × ${formatCompactReais(estimate.priceTier.realPrice)}`:'Nenhuma faixa de venda cadastrada atende a esta quantidade de TC.'}</Text></View>;})()}
        <View style={s.detailsStats}>{[
          ['XP',xpShort(detailHunt.xp),C.cyan],['LUCRO',money(detailHunt.loot-detailHunt.supplies),detailHunt.loot>=detailHunt.supplies?C.green:C.red],['LOOT',money(detailHunt.loot),C.orange],['SUPPLIES',money(detailHunt.supplies),C.red],['DURAÇÃO',`${detailHunt.duration} min`,C.cyan],['XP/H',performanceNumber(performanceValue(detailHunt,'xpHour'),'xpHour'),C.cyan],['LUCRO/H',performanceNumber(performanceValue(detailHunt,'profitHour'),'profitHour'),detailHunt.loot>=detailHunt.supplies?C.green:C.red],
        ].map(([label,value,color])=><View key={String(label)} style={s.detailsStat}><Text style={s.detailsStatLabel}>{label}</Text><Text style={[s.detailsStatValue,{color:String(color)}]}>{String(value)}</Text></View>)}</View>
        {detailHunt.session ? <>
          <View style={s.detailsSessionHeader}><Text style={s.sectionTitle}>DADOS IMPORTADOS DO TIBIA</Text><Text style={s.detailsTimes}>Início {detailHunt.session.startedAt}  ·  Fim {detailHunt.session.endedAt}</Text></View>
          <View style={s.detailsStats}>{[
            ['XP BRUTO',detailHunt.session.rawXpGain],['XP/H',detailHunt.session.xpPerHour],['XP BRUTO/H',detailHunt.session.rawXpPerHour],['BALANCE',detailHunt.session.balance],['DANO',detailHunt.session.damage],['DANO/H',detailHunt.session.damagePerHour],['CURA',detailHunt.session.healing],['CURA/H',detailHunt.session.healingPerHour],
          ].map(([label,value])=><View key={String(label)} style={s.detailsStat}><Text style={s.detailsStatLabel}>{String(label)}</Text><Text style={s.detailsStatValue}>{formatCompactNumber(Number(value))}</Text></View>)}</View>
          <View style={s.detailsListPanel}><Text style={s.sessionSectionTitle}>MONSTROS ABATIDOS · {n(detailHunt.session.monsters.reduce((sum,item)=>sum+item.count,0))}</Text>{detailHunt.session.monsters.map((item,index)=><View key={`${item.name}-${index}`} style={s.detailsEntityRow}><Text style={s.detailsCount}>{n(item.count)}×</Text><Text style={s.detailsEntityName}>{item.name}</Text></View>)}</View>
          <View style={s.detailsListPanel}><Text style={s.sessionSectionTitle}>ITENS LOOTEADOS · {detailHunt.session.items.length} TIPOS · {n(detailHunt.session.items.reduce((sum,item)=>sum+item.count,0))} UNIDADES</Text>{detailHunt.session.items.map((item,index)=><View key={`${item.name}-${index}`} style={s.detailsEntityRow}><Text style={s.detailsCount}>{n(item.count)}×</Text><Text style={s.detailsEntityName}>{item.name}</Text></View>)}</View>
        </> : <View style={s.smallEmpty}><Text style={s.smallEmptyText}>Esta hunt foi registrada manualmente e não tem o detalhamento da sessão do Tibia.</Text></View>}
      </ScrollView>
      <Pressable style={s.detailsEditButton} onPress={()=>{const h=detailHunt;setDetailHuntId(null);openEdit(h);}}><Pencil size={16} color={C.bg}/><Text style={s.detailsEditText}>EDITAR HUNT</Text></Pressable>
    </View></View>
  </Modal> : null;

  const navItems = [{id:'home',label:'Início',shortLabel:'INÍCIO',Icon:Shield},{id:'hunts',label:'Minhas Hunts',shortLabel:'HUNTS',Icon:List},{id:'performance',label:'Desempenho',shortLabel:'DESEMP.',Icon:BarChart3},{id:'reports',label:'Relatórios',shortLabel:'RELATÓRIOS',Icon:TrendingUp},{id:'calculator',label:'Calculadora',shortLabel:'CALC.',Icon:CalculatorIcon},{id:'share',label:'Compartilhar',shortLabel:'COMPART.',Icon:Share2},{id:'profile',label:'Perfil',shortLabel:'PERFIL',Icon:UserRound}] as const;
  const navigate = (id: Tab) => router.replace(id==='home'?'/':`/${id}`);
  return <SafeAreaView style={s.safe} edges={['top','left','right']}><StatusBar barStyle="light-content"/>
    <View style={desktop?s.desktopShell:s.mobileShell}>
      {desktop&&<View style={s.sideBar}><View style={s.sideBrand}><View style={s.brandIcon}><Image source={require('./assets/huntlog-icon.png')} style={s.brandLogo} resizeMode="cover"/></View><View style={s.topBrand}><Text style={s.topBrandName}>HUNT<Text style={{color:C.lime}}>LOG</Text></Text><Text style={s.topBrandCaption}>TIBIA HUNT TRACKER</Text></View></View><Pressable style={s.sideAdd} onPress={openNew}><View style={s.sideAddIcon}><Plus size={17} color={C.bg}/></View><View style={{flex:1}}><Text style={s.sideAddText}>Registrar hunt</Text><Text style={s.sideAddSub}>Importar sessão do Tibia</Text></View><ChevronRight size={15} color={C.lime}/></Pressable><Text style={s.sideCaption}>SUA CONTA</Text>{navItems.map(item=><Pressable key={item.id} style={[s.sideItem,tab===item.id&&s.sideItemActive]} onPress={()=>navigate(item.id)}><item.Icon size={18} color={tab===item.id?C.lime:C.muted}/><Text style={[s.sideItemText,tab===item.id&&s.sideItemTextActive]}>{item.label}</Text></Pressable>)}<View style={s.sideBottom}><Text style={s.sideCharacter}>{primaryCharacter?.name??'Personagem não cadastrado'}</Text><Text style={s.sideCharacterMeta}>{hunts.length} hunts registradas</Text></View></View>}
      <View style={s.appMain}>
        {!desktop&&<View style={s.topBar}><View style={s.brandIcon}><Image source={require('./assets/huntlog-icon.png')} style={s.brandLogo} resizeMode="cover"/></View><View style={s.topBrand}><Text style={s.topBrandName}>HUNT<Text style={{color:C.lime}}>LOG</Text></Text><Text style={s.topBrandCaption}>TIBIA HUNT TRACKER</Text></View><Pressable style={s.topAdd} onPress={openNew}><Plus size={19} color={C.bg}/></Pressable></View>}
        <View style={{flex:1}}>{tab==='home'?Home():tab==='hunts'?Hunts():tab==='performance'?Performance():tab==='reports'?Reports():tab==='calculator'?Calculator():tab==='share'?Share():Profile()}</View>
        {!desktop&&<View style={s.nav}>{navItems.map(item=><Pressable key={item.id} style={s.navItem} onPress={()=>navigate(item.id)}><View style={[s.navIconWrap,tab===item.id&&s.navIconActive]}><item.Icon size={18} color={tab===item.id?C.lime:C.muted}/></View><Text numberOfLines={1} style={[s.navLabel,tab===item.id&&s.navLabelActive]}>{item.shortLabel}</Text></Pressable>)}</View>}
      </View>
    </View>
    {toast? <View style={s.toast}><Check size={15} color={C.green}/><Text style={s.toastText}>{toast}</Text></View>:null}
    <Modal visible={formOpen} animationType="slide" transparent onRequestClose={()=>setFormOpen(false)}><View style={[s.modalShade,desktop&&s.modalShadeDesktop]}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[s.modalWrap,desktop&&s.modalWrapDesktop]}><View style={[s.modal,desktop&&s.modalDesktop]}>
      <View style={s.modalHeader}><View><Text style={s.modalEyebrow}>SEU DIÁRIO DE AVENTURAS</Text><Text style={s.modalTitle}>{editing?'Editar hunt':'Nova hunt'}</Text></View><Pressable style={s.closeButton} onPress={()=>setFormOpen(false)}><X size={19} color={C.muted}/></Pressable></View>
      <ScrollView style={s.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:18}}>
        <View style={s.importPanel}><Text style={s.formSection}>IMPORTAR SESSÃO DO TIBIA</Text><Text style={s.importHelp}>Cole o texto da sessão copiado do Tibia. Pode começar com “Session data” ou apenas com o horário inicial. XP, loot, supplies, dano, cura, monstros e itens serão preenchidos.</Text><TextInput value={sessionText} onChangeText={setSessionText} placeholder={'Session data: From ...\nSession: 00:54h\nXP Gain: 761,309\n...'} placeholderTextColor="#64747D" multiline textAlignVertical="top" autoCapitalize="none" style={s.sessionInput}/>{sessionText.trim()?<Text style={[s.importInputHint,hasSessionPeriod?s.importInputHintReady:s.importInputHintMissing]}>{sessionText.trim().split(/\r?\n/).length} linhas coladas · {hasSessionPeriod?'período da hunt encontrado':'horário ausente; confira se copiou a sessão inteira'}</Text>:null}<Pressable onPress={importSession} style={s.importButton}><ScrollText size={15} color={C.bg}/><Text style={s.importButtonText}>LER E PREENCHER HUNT</Text></Pressable>{importError? <Text style={s.formError}>{importError}</Text>:null}{importedSession&&<View style={s.importSummary}><Text style={s.importSummaryTitle}>SESSÃO IMPORTADA · {importedSession.startedAt}–{importedSession.endedAt}</Text><Text style={s.importSummaryText}>{importedSession.monsters.length} tipos de monstro · {importedSession.items.length} tipos de item · {n(importedSession.damage)} dano · {n(importedSession.healing)} cura</Text><Text numberOfLines={2} style={s.importSummaryText}>{importedSession.monsters.slice(0,3).map(e=>`${e.count}× ${e.name}`).join('  ·  ') || 'Sem lista de monstros'}</Text><Text numberOfLines={2} style={s.importSummaryText}>{importedSession.items.slice(0,3).map(e=>`${e.count}× ${e.name}`).join('  ·  ') || 'Sem lista de itens'}</Text></View>}</View>
        <Text style={s.formSection}>PERSONAGEM</Text>
        {characters.length>0&&<>
          <Text style={s.fieldHint}>TOQUE EM UM PERSONAGEM SALVO PARA PREENCHER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.profileChoices}>
            {characters.map(profile=><Pressable key={profile.name} onPress={()=>chooseCharacter(profile)} style={[s.profileChoice,form.character.toLowerCase()===profile.name.toLowerCase()&&s.profileChoiceActive]}>
              <Text style={[s.profileChoiceName,form.character.toLowerCase()===profile.name.toLowerCase()&&s.vocTextActive]}>{profile.isPrimary?'★ ':''}{profile.name}</Text>
              <Text style={s.profileChoiceMeta}>{profile.vocation} · LVL {profile.level}</Text>
            </Pressable>)}
          </ScrollView>
        </>}
        <View style={s.formRow}><Field label="NOME DO PERSONAGEM" value={form.character} onChange={v=>setForm({...form,character:v})} placeholder="Ex.: Knight do Vale"/><Field label="LEVEL ATUAL" value={form.level} onChange={v=>setForm({...form,level:v})} placeholder="250" keyboard="numeric" width={92}/></View>
        <Text style={s.fieldLabel}>VOCAÇÃO</Text><View style={s.vocRow}>{['EK','RP','MS','ED','Other'].map(v=><Pressable key={v} onPress={()=>setForm({...form,vocation:v})} style={[s.vocPill,form.vocation===v&&s.vocPillActive]}><Text style={[s.vocText,form.vocation===v&&s.vocTextActive]}>{v}</Text></Pressable>)}</View>
        <Pressable style={[s.primaryToggle,form.primary&&s.primaryToggleActive]} onPress={()=>setForm({...form,primary:!form.primary})}>
          <Crown size={16} color={form.primary?C.orange:C.muted}/>
          <View style={{flex:1}}><Text style={s.primaryToggleTitle}>SALVAR COMO PERSONAGEM PRINCIPAL</Text><Text style={s.primaryToggleHint}>Nome e level serão sugeridos nas próximas hunts</Text></View>
          <View style={[s.checkbox,form.primary&&s.checkboxActive]}>{form.primary&&<Check size={12} color={C.bg}/>}</View>
        </Pressable>
        <Text style={s.formSection}>DADOS DA HUNT</Text><View style={s.fieldWrap}><Text style={s.fieldLabel}>NOME DA HUNT / LOCAL</Text><TextInput value={form.location} onChangeText={v=>setForm(current=>({...current,location:v}))} placeholder="Ex.: Winter Court" placeholderTextColor="#566772" autoCapitalize="words" style={[s.input,s.huntLocationInput]}/><View style={s.savedLocationActions}><Pressable accessibilityRole="button" onPress={()=>void saveCurrentHuntLocation()} style={s.savedLocationAction}><Check size={13} color={C.lime}/><Text style={s.savedLocationActionText}>SALVAR NOME</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>{setSavedHuntLocationQuery('');setRenamingSavedLocation(null);setSavedHuntLocationsOpen(true);}} style={s.savedLocationAction}><List size={14} color={C.lime}/><Text style={s.savedLocationActionText}>USAR NOME SALVO ({savedHuntLocations.length})</Text></Pressable></View><Text style={s.savedHuntHint}>Salvar na lista é opcional. Os nomes salvos podem ser filtrados, editados ou removidos.</Text></View>
        <View style={s.formRow}><Field label="DATA (AAAA-MM-DD)" value={form.date} onChange={v=>setForm({...form,date:v})} placeholder={today()} width="58%"/><Field label="DURAÇÃO (MIN)" value={form.duration} onChange={v=>setForm({...form,duration:v})} placeholder="60" keyboard="numeric" width="38%"/></View>
        <View style={s.formRow}><Field label="XP GANHA" value={form.xp} onChange={v=>setForm({...form,xp:v})} placeholder="1.500.000" keyboard="numeric"/><Field label="LOOT (GP)" value={form.loot} onChange={v=>setForm({...form,loot:v})} placeholder="850.000" keyboard="numeric"/></View>
        <Field label="SUPPLIES (GP)" value={form.supplies} onChange={v=>setForm({...form,supplies:v})} placeholder="420.000" keyboard="numeric"/>
        <Text style={s.numberHint}>XP, loot e supplies aceitam números com ou sem separadores. Ex.: 1500000 ou 1.500.000.</Text>
        <Pressable disabled={saving} onPress={save} style={[s.saveButton,saving&&{opacity:.65}]}><LinearGradient colors={[C.lime,'#A6E454']} style={s.saveGradient}>{saving?<Activity size={17} color={C.bg}/>:<Check size={17} color={C.bg}/>}<Text style={s.saveText}>{saving?'SALVANDO…':editing?'SALVAR ALTERAÇÕES':'SALVAR HUNT'}</Text></LinearGradient></Pressable>
      </ScrollView>
    </View></KeyboardAvoidingView></View></Modal>
    <Modal visible={savedHuntLocationsOpen} transparent animationType="slide" onRequestClose={()=>setSavedHuntLocationsOpen(false)}>
      <View style={[s.modalShade,desktop&&s.modalShadeDesktop]}><View style={[s.modal,desktop&&s.savedLocationsModal]}>
        <View style={s.modalHeader}><View><Text style={s.modalEyebrow}>NOMES REUTILIZÁVEIS</Text><Text style={s.modalTitle}>Hunts salvas</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar nomes salvos" style={s.closeButton} onPress={()=>setSavedHuntLocationsOpen(false)}><X size={19} color={C.muted}/></Pressable></View>
        <Text style={s.savedLocationsIntro}>Mais recentes primeiro. Toque no nome para preencher a hunt. Você também pode editar ou apagar nomes.</Text>
        <View style={s.savedLocationSearch}><Search size={16} color={C.muted}/><TextInput value={savedHuntLocationQuery} onChangeText={setSavedHuntLocationQuery} placeholder="Filtrar nomes de hunt" placeholderTextColor="#64747D" style={s.searchInput} autoCapitalize="none" returnKeyType="search"/></View>
        <ScrollView style={s.savedLocationsList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {savedHuntLocations.filter(name=>name.toLocaleLowerCase().includes(savedHuntLocationQuery.trim().toLocaleLowerCase())).map(name=><View key={name} style={s.savedNameRow}>
            {renamingSavedLocation===name?<TextInput value={savedLocationDraft} onChangeText={setSavedLocationDraft} style={[s.profileInput,s.savedNameEditInput]} autoFocus selectTextOnFocus autoCapitalize="words" onSubmitEditing={()=>void commitRenameSavedLocation()} returnKeyType="done"/>:<Pressable style={s.savedNamePick} onPress={()=>pickSavedHuntLocation(name)}><Text style={s.savedNameText}>{name}</Text><Text style={s.savedNameHint}>USAR NESTA HUNT</Text></Pressable>}
            {renamingSavedLocation===name?<><Pressable accessibilityRole="button" accessibilityLabel={`Salvar edição de ${name}`} style={s.savedNameIcon} onPress={()=>void commitRenameSavedLocation()}><Check size={16} color={C.green}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Cancelar edição" style={s.savedNameIcon} onPress={()=>setRenamingSavedLocation(null)}><X size={16} color={C.muted}/></Pressable></>:<><Pressable accessibilityRole="button" accessibilityLabel={`Editar nome ${name}`} style={s.savedNameIcon} onPress={()=>beginRenameSavedLocation(name)}><Pencil size={15} color={C.lime}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Apagar nome ${name}`} style={s.savedNameIcon} onPress={()=>removeSavedHuntLocation(name)}><Trash2 size={15} color={C.red}/></Pressable></>}
          </View>)}
          {!savedHuntLocations.filter(name=>name.toLocaleLowerCase().includes(savedHuntLocationQuery.trim().toLocaleLowerCase())).length&&<View style={s.smallEmpty}><Text style={s.smallEmptyText}>{savedHuntLocations.length?'Nenhum nome corresponde à busca.':'Você ainda não salvou nomes de hunt.'}</Text></View>}
        </ScrollView>
      </View></View>
    </Modal>
    <Modal visible={Boolean(formError)} transparent animationType="fade" onRequestClose={()=>setFormError('')}>
      <View style={s.feedbackShade}>
        <View style={[s.feedbackCard,desktop&&s.feedbackCardDesktop]}>
          <View style={s.feedbackIcon}><AlertCircle size={25} color={C.red}/></View>
          <Text style={s.feedbackTitle}>{formErrorTitle}</Text>
          <Text accessibilityRole="alert" style={s.feedbackMessage}>{formError}</Text>
          <Pressable accessibilityRole="button" onPress={()=>setFormError('')} style={s.feedbackButton}>
            <Text style={s.feedbackButtonText}>ENTENDI</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    {HuntDetails()}
  </SafeAreaView>;
}

function Field({label,value,onChange,placeholder,keyboard,width}: {label:string;value:string;onChange:(v:string)=>void;placeholder:string;keyboard?:'numeric';width?:any}) {
  return <View style={[s.fieldWrap,width?{width}:null]}><Text style={s.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#566772" keyboardType={keyboard==='numeric'?'decimal-pad':'default'} autoCapitalize={keyboard==='numeric'?'none':'words'} style={s.input}/></View>;
}

const s = StyleSheet.create({
  mobileShell:{flex:1,minWidth:0,width:'100%'},
  tcRateCard:{padding:16,marginBottom:18,borderRadius:16,borderWidth:1,borderColor:C.line,backgroundColor:C.panel},
  calculatorConfigDesktop:{padding:22,marginBottom:22,borderRadius:18},
  calculatorPanel:{padding:16,marginBottom:16},
  calculatorPanelDesktop:{padding:22,marginBottom:22,borderRadius:18},
  tcRateHeading:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:9},
  tcRateTitle:{color:C.lime,fontSize:10,fontWeight:'900',letterSpacing:.7},
  tcRateHint:{color:'#AABBB1',fontSize:10,lineHeight:16,marginBottom:16},
  tcRateRow:{flexDirection:'row',gap:12},
  tcRateField:{flex:1,minWidth:0,marginBottom:12},
  tcRateLabel:{color:'#B7C5BC',fontSize:8,fontWeight:'900',letterSpacing:.65,marginBottom:7},
  tcRateInput:{height:46,paddingHorizontal:13,borderRadius:10,borderWidth:1,borderColor:'#34453D',backgroundColor:'#0A1410',color:C.text,fontSize:13,fontWeight:'700'},
  tcRatePerCoin:{color:C.green,fontSize:10,fontWeight:'800',marginTop:0,marginBottom:14},
  tcRateMissing:{color:C.orange,fontSize:10,fontWeight:'700',lineHeight:15,marginTop:0,marginBottom:14},
  tcRateResult:{padding:16,borderRadius:13,borderWidth:1,borderColor:'#344C3F',backgroundColor:'#14221D'},
  tcRateResultLabel:{color:'#A1B9A8',fontSize:8,fontWeight:'900',letterSpacing:.75},
  tcRateResultValue:{color:C.green,fontSize:24,fontWeight:'900',marginTop:7},
  tcRateResultMeta:{color:'#B1C1B5',fontSize:9,lineHeight:15,marginTop:6},
  tcPresets:{flexDirection:'row',gap:8,marginTop:-2,marginBottom:14},
  tcPreset:{minHeight:34,minWidth:58,paddingHorizontal:12,borderRadius:10,borderWidth:1,borderColor:C.line,backgroundColor:'#0D151E',alignItems:'center',justifyContent:'center'},
  tcPresetActive:{borderColor:'#667E45',backgroundColor:'#253225'},
  tcPresetText:{color:C.muted,fontSize:10,fontWeight:'800'},
  tcPresetTextActive:{color:C.lime},
  calculatorIntro:{color:C.muted,fontSize:11,lineHeight:17,marginTop:-8,marginBottom:16},
  tibiaQuoteResult:{minHeight:76,flexDirection:'row',alignItems:'center',padding:14,borderRadius:13,borderWidth:1,borderColor:'#344C3F',backgroundColor:'#14221D'},
  tibiaQuoteMetric:{flex:1,gap:5},
  tibiaQuoteMetricValue:{color:C.green,fontSize:19,fontWeight:'900'},
  tibiaQuoteDivider:{width:1,height:40,backgroundColor:'#344C3F',marginHorizontal:14},
  saleTier:{padding:14,marginBottom:11,borderRadius:13,borderWidth:1,borderColor:C.line,backgroundColor:'#0D151E'},
  saleTierHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  saleTierTitle:{color:C.lime,fontSize:9,fontWeight:'900',letterSpacing:.8},
  removeTierButton:{width:30,height:30,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:'#FF758614'},
  saleTierFields:{gap:8},
  saleTierFieldsDesktop:{flexDirection:'row',alignItems:'flex-end',gap:12},
  saleTierPair:{flexDirection:'row',gap:10},
  saleTierPairDesktop:{flex:2},
  tierField:{flex:1,minWidth:0,marginBottom:8},
  saleTierRow:{flexDirection:'column',alignItems:'stretch',gap:7,marginBottom:12,borderBottomWidth:1,borderColor:C.line,paddingBottom:12},
  saleTierRowDesktop:{flexDirection:'row',alignItems:'flex-end'},
  saleTierInput:{flex:1,minWidth:0},
  removeTier:{width:34,height:46,alignItems:'center',justifyContent:'center'},
  addTier:{height:40,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderWidth:1,borderColor:C.line,borderRadius:10,marginBottom:4},
  addTierButton:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:11,borderWidth:1,borderColor:'#586F3C',backgroundColor:'#17241C'},
  addTierText:{color:C.lime,fontSize:9,fontWeight:'900',letterSpacing:.6},
  saleResultCard:{padding:17,borderRadius:14,borderWidth:1,borderColor:'#3A5945',backgroundColor:'#14251D'},
  saleResultValue:{color:C.green,fontSize:28,fontWeight:'900',marginTop:7},
  saleGpLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderColor:'#345043',paddingTop:11,marginTop:13},
  saleGpLabel:{color:'#A4B5AA',fontSize:9,fontWeight:'700'},
  saleGpValue:{color:C.text,fontSize:11,fontWeight:'900'},
  huntEstimateLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,padding:13,marginTop:13,borderRadius:12,borderWidth:1,borderColor:C.line,backgroundColor:'#0D151E'},
  huntEstimateLabel:{color:'#AAB9AF',fontSize:8,fontWeight:'900',letterSpacing:.6},
  huntEstimateHint:{color:C.muted,fontSize:8,marginTop:5},
  huntEstimateValue:{color:C.green,fontSize:15,fontWeight:'900'},
  reportHuntList:{marginTop:14,padding:13,borderRadius:12,borderWidth:1,borderColor:C.line,backgroundColor:'#0D151E'},
  profileCoinValue:{color:C.green,fontSize:24,fontWeight:'900',marginBottom:4},
  periodTextCompact:{fontSize:7,letterSpacing:.2},
  cardCoinStats:{flexDirection:'row',alignItems:'center',paddingVertical:11,marginBottom:11,borderTopWidth:1,borderBottomWidth:1,borderColor:'#FFFFFF1B'},
  cardCoinValue:{fontSize:17,fontWeight:'900',letterSpacing:-.3,marginTop:5},
  reportHuntListTitle:{color:C.lime,fontSize:9,fontWeight:'900',letterSpacing:.7,marginBottom:5},
  reportHuntRow:{paddingVertical:9,borderBottomWidth:1,borderColor:C.line},
  reportHuntTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  reportHuntName:{flex:1,color:C.text,fontSize:10,fontWeight:'800'},
  reportHuntAmount:{color:C.green,fontSize:12,fontWeight:'900'},
  reportHuntMeta:{color:C.muted,fontSize:8,lineHeight:13,marginTop:4},
  savedHuntHint:{color:C.muted,fontSize:8,lineHeight:13,marginTop:6},
  homeRealHint:{color:C.muted,fontSize:9,lineHeight:14,marginTop:-13,marginBottom:20},
  rowNumbers:{alignItems:'flex-end',maxWidth:175},
  rowReal:{color:C.green,fontSize:8,fontWeight:'800',marginTop:3},
  detailRealCard:{padding:15,marginBottom:14,borderRadius:13,borderWidth:1,borderColor:'#3A5945',backgroundColor:'#14251D'},
  detailRealTitle:{color:'#A1B9A8',fontSize:8,fontWeight:'900',letterSpacing:.8},
  detailRealValue:{color:C.green,fontSize:23,fontWeight:'900',marginTop:6},
  detailRealMeta:{color:'#B1C1B5',fontSize:9,lineHeight:15,marginTop:5},
  calculatorReportsLink:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:12},
  tcRateFootnote:{color:C.muted,fontSize:8,lineHeight:12,marginTop:8},
  reportExportButton:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:12,marginTop:-5,marginBottom:14,borderRadius:12,borderWidth:1,borderColor:'#536B3E',backgroundColor:'#1B2A22'},
  reportExportButtonDisabled:{opacity:.48},
  reportExportText:{color:C.lime,fontSize:10,fontWeight:'900',letterSpacing:.45},
  reportExportError:{color:C.red,fontSize:10,lineHeight:15,marginTop:-7,marginBottom:12},
  importInputHint:{fontSize:8,lineHeight:12,marginTop:5,marginBottom:2},
  importInputHintReady:{color:C.green},
  importInputHintMissing:{color:C.orange},
  huntLocationInput:{width:'100%',height:46,minHeight:46,alignSelf:'stretch',flexShrink:0,paddingHorizontal:11,fontSize:12},savedLocationActions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:9},savedLocationAction:{minHeight:36,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:12,borderRadius:10,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},savedLocationActionText:{fontSize:8,fontWeight:'900',letterSpacing:.45,color:C.lime},savedLocationsModal:{width:'100%',maxWidth:570,maxHeight:'78%',alignSelf:'center',borderRadius:22},savedLocationsIntro:{fontSize:10,lineHeight:15,color:C.muted,marginTop:-7,marginBottom:13},savedLocationSearch:{height:42,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:11,marginBottom:10,borderRadius:11,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},savedLocationsList:{flexShrink:1,minHeight:90},savedNameRow:{minHeight:60,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,borderBottomWidth:1,borderColor:C.line},savedNamePick:{flex:1,minWidth:0,paddingVertical:9},savedNameText:{fontSize:12,fontWeight:'800',color:C.text},savedNameHint:{fontSize:7,fontWeight:'900',letterSpacing:.55,color:C.lime,marginTop:4},savedNameIcon:{width:34,height:36,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:C.panel},savedNameEditInput:{flex:1,minWidth:0,height:40,marginBottom:0,paddingHorizontal:9},
  inlineActions:{flexDirection:'row',alignItems:'center',gap:9},refreshButton:{width:30,height:30,borderRadius:10,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},selectionToolbar:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7,marginBottom:12},selectionAction:{minHeight:34,paddingHorizontal:12,borderRadius:10,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},selectionActionActive:{borderColor:'#506E45',backgroundColor:'#24372C'},selectionActionText:{fontSize:9,fontWeight:'800',color:C.muted},selectionActionTextActive:{color:C.lime},selectionDelete:{borderColor:'#53323A',backgroundColor:'#2A1C24'},selectionDeleteText:{color:C.red},selectionDisabled:{opacity:.45},selectHuntButton:{width:28,height:28,marginRight:8,borderRadius:9,borderWidth:1,borderColor:C.muted,alignItems:'center',justifyContent:'center'},selectHuntButtonActive:{backgroundColor:C.lime,borderColor:C.lime},clearHistoryButton:{minHeight:42,marginTop:12,marginBottom:7,borderRadius:11,backgroundColor:'#21171D',borderWidth:1,borderColor:'#472B33',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},clearHistoryText:{fontSize:9,fontWeight:'900',letterSpacing:.4,color:C.red},
  huntLibraryIntro:{padding:14,marginBottom:13,borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.panel},huntLibraryTitle:{color:C.text,fontSize:13,fontWeight:'900'},huntLibrarySubtitle:{color:C.muted,fontSize:10,lineHeight:15,marginTop:4},sortHeader:{gap:8,marginBottom:10},sortChoices:{flexDirection:'row',flexWrap:'wrap',gap:6},sortChip:{minHeight:31,paddingHorizontal:11,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:C.panel,borderWidth:1,borderColor:C.line},sortChipActive:{backgroundColor:'#263527',borderColor:'#718E4B'},sortChipText:{color:C.muted,fontSize:8,fontWeight:'900',letterSpacing:.45},sortChipTextActive:{color:C.lime},performanceIntro:{color:C.muted,fontSize:11,lineHeight:17,marginTop:-8,marginBottom:15},metricPicker:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:3,marginBottom:13},metricChip:{flexGrow:1},performanceSummary:{padding:15,marginBottom:12,borderRadius:15,borderWidth:1,borderColor:'#37534A',backgroundColor:'#13241F'},averageLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},averageLabel:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#A2B5AA'},averageValue:{fontSize:17,fontWeight:'900',color:C.green},averageHint:{fontSize:9,color:'#91A39B',marginTop:6},performanceHighlights:{flexDirection:'row',gap:9,marginBottom:18},performanceHighlight:{flex:1,minWidth:0,padding:12,borderRadius:14,borderWidth:1},bestHighlight:{backgroundColor:'#1A2A20',borderColor:'#506B3C'},worstHighlight:{backgroundColor:'#2A211C',borderColor:'#644936'},highlightHeader:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:10},highlightEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:.6,color:C.text},highlightLocation:{fontSize:12,fontWeight:'900',color:C.text},highlightMeta:{fontSize:8,color:C.muted,marginTop:4},highlightValue:{fontSize:15,fontWeight:'900',color:C.lime,marginTop:12},highlightCompare:{fontSize:8,color:'#A8B7AE',marginTop:4},performanceListHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:9},rankRow:{flexDirection:'row',gap:10,padding:12,marginBottom:8,borderRadius:13,borderWidth:1,borderColor:C.line,backgroundColor:C.panel},rankNumber:{width:26,height:26,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#1A2731'},rankNumberBest:{backgroundColor:'#3A4B25'},rankNumberText:{color:C.muted,fontSize:11,fontWeight:'900'},rankNumberTextBest:{color:C.lime},rankBody:{flex:1,minWidth:0},rankTitleLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},rankTitle:{flex:1,color:C.text,fontSize:11,fontWeight:'800'},rankValue:{color:C.green,fontSize:10,fontWeight:'900'},rankMeta:{color:C.muted,fontSize:8,marginTop:4},rankTrack:{height:5,overflow:'hidden',borderRadius:4,backgroundColor:'#26333A',marginTop:9},rankFill:{height:'100%',borderRadius:4,backgroundColor:C.green},rankFillLow:{backgroundColor:C.orange},rankCompare:{fontSize:8,fontWeight:'800',marginTop:5},rankCompareGood:{color:C.green},rankCompareLow:{color:C.orange},
  detailsShade:{flex:1,justifyContent:'flex-end',backgroundColor:'#000B'},detailsShadeDesktop:{justifyContent:'center',padding:22},detailsModal:{width:'100%',maxHeight:'92%',padding:18,paddingBottom:12,borderTopLeftRadius:23,borderTopRightRadius:23,borderWidth:1,borderColor:'#30414A',backgroundColor:'#0D151E'},detailsModalDesktop:{maxWidth:700,alignSelf:'center',borderRadius:21},detailsHeader:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:13},detailsTitle:{fontSize:21,fontWeight:'900',color:C.text},detailsSubtitle:{fontSize:10,fontWeight:'700',color:C.lime,marginTop:4},detailsScroll:{flexShrink:1},detailsStats:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:13},detailsStat:{width:'31.5%',minHeight:54,padding:9,borderRadius:10,borderWidth:1,borderColor:C.line,backgroundColor:C.panel},detailsStatLabel:{color:C.muted,fontSize:7,fontWeight:'900',letterSpacing:.7},detailsStatValue:{fontSize:11,fontWeight:'900',color:C.text,marginTop:5},detailsSessionHeader:{gap:5,marginTop:3,marginBottom:11},detailsTimes:{color:'#AABABD',fontSize:9,lineHeight:14},detailsListPanel:{padding:12,marginBottom:10,borderRadius:12,borderWidth:1,borderColor:'#2D4248',backgroundColor:'#101D24'},detailsEntityRow:{minHeight:27,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderColor:'#FFFFFF0A'},detailsCount:{minWidth:55,color:C.cyan,fontSize:10,fontWeight:'900',fontVariant:['tabular-nums']},detailsEntityName:{flex:1,color:'#E0E7E8',fontSize:11,lineHeight:16},detailsEditButton:{height:46,marginTop:12,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:C.lime},detailsEditText:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:C.bg},
  feedbackShade:{flex:1,backgroundColor:'#000B',alignItems:'center',justifyContent:'center',padding:24},feedbackCard:{width:'100%',maxWidth:380,padding:24,borderRadius:20,alignItems:'center',backgroundColor:'#111C27',borderWidth:1,borderColor:'#35434D',shadowColor:'#000',shadowOpacity:.35,shadowRadius:22,elevation:16},feedbackCardDesktop:{maxWidth:440},feedbackIcon:{width:54,height:54,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#FF75861A',marginBottom:16},feedbackTitle:{fontSize:18,fontWeight:'800',color:C.text,textAlign:'center',marginBottom:10},feedbackMessage:{fontSize:15,lineHeight:22,color:'#D7E0E4',textAlign:'center',marginBottom:22},feedbackButton:{minHeight:46,minWidth:130,paddingHorizontal:22,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:C.lime},feedbackButtonText:{fontSize:12,fontWeight:'900',letterSpacing:.8,color:C.bg},
  sessionRule:{marginTop:17,marginBottom:13},sessionTime:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:12},sessionTimeText:{flex:1,color:'#C0D0D2',fontSize:8,fontWeight:'800',letterSpacing:.35},sessionMetricGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:13},sessionMetric:{width:'23%',minHeight:43,paddingVertical:7,paddingHorizontal:8,borderRadius:9,backgroundColor:'#FFFFFF0A',borderWidth:1,borderColor:'#FFFFFF10'},sessionLabel:{fontSize:7,fontWeight:'900',letterSpacing:.65,color:'#91A6A8'},sessionValue:{fontSize:10,fontWeight:'900',color:C.text,marginTop:4},sessionLists:{gap:11},sessionListPanel:{padding:10,borderRadius:11,backgroundColor:'#07131A66',borderWidth:1,borderColor:'#FFFFFF12'},sessionSectionTitle:{fontSize:8,fontWeight:'900',letterSpacing:.65,color:C.lime,marginBottom:8},sessionEntityRow:{minHeight:19,flexDirection:'row',alignItems:'flex-start',gap:7,paddingVertical:2},sessionCount:{minWidth:37,color:C.cyan,fontSize:8,fontWeight:'900',fontVariant:['tabular-nums']},sessionEntityName:{flex:1,color:'#D7E1E1',fontSize:8.5,lineHeight:12},sessionItemsGrid:{flexDirection:'row',flexWrap:'wrap'},sessionItemRow:{width:'50%',minHeight:20,flexDirection:'row',alignItems:'flex-start',gap:4,paddingVertical:2,paddingRight:5},creditRule:{marginTop:15,marginBottom:10},cardCredit:{textAlign:'center',fontSize:7,fontWeight:'800',letterSpacing:1,color:'#819294',marginTop:9},cardCreditName:{color:C.lime,fontWeight:'900'},
  safe:{flex:1,backgroundColor:C.bg},appMain:{flex:1,minWidth:0},desktopShell:{flex:1,flexDirection:'row'},sideBar:{width:246,backgroundColor:'#0B121A',borderRightWidth:1,borderColor:'#1B2832',padding:20},sideBrand:{flexDirection:'row',alignItems:'center',marginBottom:2},sideCaption:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:C.muted,marginBottom:12,marginLeft:8,marginTop:26},sideItem:{height:45,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:12,borderRadius:11,marginBottom:5},sideItemActive:{backgroundColor:'#1A2826'},sideItemText:{fontSize:12,fontWeight:'700',color:C.muted},sideItemTextActive:{color:C.lime},sideBottom:{marginTop:'auto',borderTopWidth:1,borderColor:C.line,paddingTop:17},sideCharacter:{fontSize:12,fontWeight:'800',color:C.text},sideCharacterMeta:{fontSize:10,color:C.muted,marginTop:4},sideAdd:{minHeight:56,marginTop:14,marginBottom:0,paddingHorizontal:9,borderRadius:13,backgroundColor:'#151F25',borderWidth:1,borderColor:'#34472F',flexDirection:'row',alignItems:'center',gap:9},sideAddIcon:{width:32,height:32,borderRadius:10,backgroundColor:C.lime,alignItems:'center',justifyContent:'center'},sideAddText:{fontSize:10,fontWeight:'900',color:C.text},sideAddSub:{fontSize:8,fontWeight:'600',color:'#8FA19A',marginTop:3},topBar:{height:58,paddingHorizontal:21,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#18232D'}, brandIcon:{width:36,height:36,borderRadius:11,backgroundColor:'#0B1717',borderWidth:1,borderColor:'#26372F',overflow:'hidden',alignItems:'center',justifyContent:'center'},brandLogo:{width:36,height:36,borderRadius:10}, topBrand:{marginLeft:10},topBrandName:{fontSize:16,fontWeight:'900',letterSpacing:1.4,color:C.text},topBrandCaption:{fontSize:8,fontWeight:'700',color:C.muted,letterSpacing:1.35,marginTop:2},topAdd:{marginLeft:'auto',width:34,height:34,borderRadius:11,backgroundColor:C.lime,alignItems:'center',justifyContent:'center'},
  content:{paddingHorizontal:20,paddingTop:20,paddingBottom:22,width:'100%',maxWidth:1180,alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:20},eyebrow:{fontSize:9,fontWeight:'800',letterSpacing:1.7,color:C.muted,marginBottom:6},title:{fontSize:25,fontWeight:'800',letterSpacing:-.65,color:C.text},levelBadge:{borderWidth:1,borderColor:'#3D392B',backgroundColor:'#282519',borderRadius:20,paddingVertical:7,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},levelBadgeText:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:C.orange},
  profileCard:{minHeight:68,flexDirection:'row',alignItems:'center',gap:11,padding:11,marginTop:-6,marginBottom:14,borderRadius:15,backgroundColor:'#111B25',borderWidth:1,borderColor:C.line},profileIcon:{width:36,height:36,borderRadius:11,backgroundColor:'#FFB96718',alignItems:'center',justifyContent:'center'},profileLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:C.muted,marginBottom:3},profileName:{fontSize:13,fontWeight:'800',color:C.text},profileMeta:{fontSize:9,fontWeight:'600',color:'#95A5AE',marginTop:3},
  hero:{borderRadius:20,padding:19,overflow:'hidden',borderWidth:1,borderColor:'#2A4441',marginBottom:23},heroGlow:{position:'absolute',width:140,height:140,borderRadius:100,backgroundColor:'#78BD6740',right:-55,top:10},heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},live:{flexDirection:'row',alignItems:'center',gap:7},liveDot:{width:7,height:7,borderRadius:5,backgroundColor:C.lime},liveText:{fontSize:9,fontWeight:'900',letterSpacing:1.5,color:'#B5C5C4'},heroLabel:{fontSize:10,fontWeight:'800',letterSpacing:1.5,color:'#AFC2BE',marginTop:24},heroAmount:{fontSize:34,fontWeight:'900',letterSpacing:-1.2,color:C.lime,marginTop:3},heroRealRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:15,padding:12,borderRadius:13,borderWidth:1,borderColor:'#74D39745',backgroundColor:'#071A183D'},heroRealLabel:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#AFC2BE'},heroRealAmount:{fontSize:20,fontWeight:'900',color:C.green,marginTop:4},heroRealIcon:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:'#8CE1A51A'},heroDivider:{height:1,backgroundColor:'#FFFFFF16',marginTop:17,marginBottom:12},heroFoot:{flexDirection:'row',alignItems:'center',gap:14},heroMetric:{flexDirection:'row',alignItems:'center',gap:5},heroMetricText:{fontSize:11,color:'#D3DDDC',fontWeight:'600'},heroHint:{marginLeft:'auto',fontSize:8,color:'#829593',fontWeight:'800',letterSpacing:.8},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:11,marginTop:3},sectionTitle:{fontSize:10,fontWeight:'900',letterSpacing:1.25,color:'#C4CFD2'},sectionNote:{fontSize:10,color:C.muted,fontWeight:'600'},link:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:C.lime,flexDirection:'row',alignItems:'center'},statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:23},stat:{width:'48.5%',minHeight:104,borderRadius:15,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,padding:12},statIcon:{width:28,height:28,borderRadius:9,alignItems:'center',justifyContent:'center'},statLabel:{position:'absolute',top:19,left:49,fontSize:8,fontWeight:'800',letterSpacing:.75,color:C.muted},statValue:{fontSize:19,fontWeight:'800',color:C.text,marginTop:8,letterSpacing:-.3},statSub:{fontSize:9,color:C.muted,marginTop:2},
  card:{borderRadius:15,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,overflow:'hidden'},huntRow:{minHeight:69,paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center'},rowMark:{width:35,height:35,borderRadius:11,backgroundColor:'#C5F36B12',alignItems:'center',justifyContent:'center',marginRight:10},rowTitle:{color:C.text,fontWeight:'700',fontSize:12,marginBottom:4},rowMeta:{color:C.muted,fontSize:9,fontWeight:'600'},rowGain:{fontSize:11,fontWeight:'800',marginBottom:4},separator:{height:1,marginLeft:57,backgroundColor:C.line},
  empty:{borderRadius:17,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,paddingHorizontal:24,paddingVertical:27,alignItems:'center'},emptyIcon:{width:48,height:48,borderRadius:16,backgroundColor:'#1A2833',alignItems:'center',justifyContent:'center',marginBottom:13},emptyTitle:{fontWeight:'800',fontSize:14,color:C.text},emptyText:{textAlign:'center',fontSize:11,lineHeight:18,color:C.muted,marginTop:6,maxWidth:240},emptyButton:{height:36,borderRadius:10,backgroundColor:C.lime,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:6,marginTop:16},emptyButtonText:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:C.bg},bigAdd:{borderRadius:13,overflow:'hidden',marginTop:15},bigAddGradient:{height:49,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},bigAddText:{flex:1,textAlign:'center',fontSize:10,fontWeight:'900',letterSpacing:.75,color:C.bg},tip:{textAlign:'center',fontSize:8,color:'#5E707B',fontWeight:'700',letterSpacing:.7,marginTop:11},
  nav:{height:69,backgroundColor:'#0C131B',borderTopWidth:1,borderColor:'#1B2832',flexDirection:'row',paddingHorizontal:3,paddingTop:7,paddingBottom:5},navItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:3},navIconWrap:{width:31,height:26,alignItems:'center',justifyContent:'center',borderRadius:9},navIconActive:{backgroundColor:'#C5F36B12'},navLabel:{fontSize:6.5,fontWeight:'800',letterSpacing:.1,color:C.muted},navLabelActive:{color:C.lime},toast:{position:'absolute',bottom:79,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:15,paddingVertical:11,borderRadius:13,backgroundColor:'#1A2B27',borderWidth:1,borderColor:'#335244'},toastText:{fontSize:11,fontWeight:'700',color:C.text},
  roundIcon:{height:38,width:38,borderRadius:13,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},periods:{height:41,borderRadius:12,backgroundColor:C.panel,padding:4,flexDirection:'row',marginTop:-2,marginBottom:16},period:{flex:1,alignItems:'center',justifyContent:'center',borderRadius:9},periodActive:{backgroundColor:'#27382E'},periodText:{fontSize:9,fontWeight:'800',letterSpacing:.65,color:C.muted},periodTextActive:{color:C.lime},reportHero:{backgroundColor:'#14241F',borderWidth:1,borderColor:'#345040',borderRadius:17,padding:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},reportLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.25,color:'#9FB2A7'},reportProfit:{fontSize:28,fontWeight:'900',letterSpacing:-.6,color:C.green,marginTop:4},profitTag:{flexDirection:'row',alignItems:'center',gap:3,marginTop:7},profitTagText:{fontSize:8,fontWeight:'800',letterSpacing:.55,color:'#A6B7AA'},reportHeroIcon:{height:43,width:43,borderRadius:14,backgroundColor:'#8CE1A51A',alignItems:'center',justifyContent:'center'},reportGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:21},reportTile:{width:'48.5%',backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:14,padding:12,minHeight:91},tileLabel:{fontSize:8,fontWeight:'800',letterSpacing:.75,color:C.muted,marginTop:8},tileValue:{fontSize:15,fontWeight:'800',color:C.text,marginTop:4},chartLegend:{color:C.muted,fontSize:9,fontWeight:'700'},legendDot:{width:6,height:6,borderRadius:4,backgroundColor:C.cyan},chartCard:{height:148,borderRadius:15,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,paddingHorizontal:12,paddingTop:13,paddingBottom:9,marginBottom:21},chartBars:{flex:1,flexDirection:'row',justifyContent:'space-between',alignItems:'stretch',gap:8},barColumn:{flex:1,alignItems:'center',justifyContent:'flex-end'},barValue:{fontSize:8,color:C.muted,fontWeight:'700',height:13},barTrack:{height:88,width:'100%',justifyContent:'flex-end',alignItems:'center'},bar:{width:'58%',minHeight:5,borderRadius:4},barDate:{fontSize:8,color:C.muted,marginTop:6,fontWeight:'700'},smallEmpty:{alignItems:'center',padding:18,borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,gap:10},smallEmptyText:{color:C.muted,fontSize:11},
  shareIntro:{fontSize:12,lineHeight:18,color:C.muted,marginTop:-10,marginBottom:19},pickRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},pickCount:{borderRadius:10,paddingVertical:5,paddingHorizontal:9,backgroundColor:C.panel},pickCountText:{fontSize:9,color:C.muted,fontWeight:'700'},huntPills:{gap:8,paddingBottom:14},huntPill:{maxWidth:165,minWidth:130,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:9,paddingHorizontal:10},huntPillActive:{borderColor:'#6A8A45',backgroundColor:'#1B2A22'},huntPillText:{fontSize:10,color:'#BEC8CB',fontWeight:'700',marginTop:5},huntPillTextActive:{color:C.lime},pillDate:{fontSize:8,color:C.muted,marginTop:3,fontWeight:'700'},shareCard:{minHeight:305,borderRadius:19,overflow:'hidden',padding:18,borderWidth:1,borderColor:'#385147',marginTop:16},cardOrnament:{position:'absolute',width:170,height:170,right:-70,top:-69,borderRadius:100,borderWidth:24,borderColor:'#C5F36B0D'},shareCardHeader:{flexDirection:'row',alignItems:'center'},brandMark:{width:32,height:32,borderRadius:10,backgroundColor:C.lime,alignItems:'center',justifyContent:'center',marginRight:9},brandName:{fontSize:12,fontWeight:'900',letterSpacing:1,color:C.text},brandSub:{fontSize:7,fontWeight:'800',letterSpacing:1.2,color:'#889A9B',marginTop:3},cardDate:{marginLeft:'auto',flexDirection:'row',alignItems:'center',gap:5},cardDateText:{fontSize:9,fontWeight:'800',color:'#B8C4C5',letterSpacing:.5},cardRule:{height:1,backgroundColor:'#FFFFFF1B',marginVertical:13},cardLocLine:{flexDirection:'row',alignItems:'center',gap:6},cardLocation:{fontSize:17,fontWeight:'800',color:C.text,letterSpacing:-.2},cardChar:{fontSize:11,color:C.lime,fontWeight:'800',marginTop:5},cardCharMuted:{color:'#A5B4B5',fontWeight:'600'},cardStats:{flexDirection:'row',alignItems:'center',marginTop:18,marginBottom:13},cardStat:{flex:1},cardStatLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:'#9BAEAF'},cardStatValue:{fontSize:21,fontWeight:'900',letterSpacing:-.5,marginTop:6},cardStatUnit:{fontSize:8,fontWeight:'800',letterSpacing:1,color:'#809293',marginTop:2},cardStatDivider:{width:1,height:44,backgroundColor:'#FFFFFF24',marginHorizontal:14},cardBreakdown:{flexDirection:'row',alignItems:'center',gap:10},cardBreakLabel:{fontSize:7,fontWeight:'900',letterSpacing:.9,color:'#8D9D9F'},cardBreakValue:{fontSize:10,fontWeight:'800',color:'#DFE7E8',marginTop:4},cardMinus:{color:C.muted,fontSize:12,marginTop:8},cardDuration:{marginLeft:'auto',flexDirection:'row',gap:5,alignItems:'center',backgroundColor:'#FFB96716',borderRadius:8,paddingVertical:6,paddingHorizontal:7},cardDurationText:{fontSize:8,fontWeight:'900',color:C.orange},cardFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},cardFooterText:{fontSize:7,fontWeight:'900',letterSpacing:1,color:'#829393'},shareButton:{borderRadius:13,overflow:'hidden',marginTop:15},shareFootnote:{textAlign:'center',fontSize:7,color:'#677782',fontWeight:'800',letterSpacing:.7,marginTop:10},
  modalShade:{flex:1,backgroundColor:'#000A',justifyContent:'flex-end'},modalShadeDesktop:{justifyContent:'center',padding:24},modalWrap:{flex:1,justifyContent:'flex-end'},modalWrapDesktop:{justifyContent:'center'},modal:{maxHeight:'94%',backgroundColor:'#0D151E',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:'#273641',paddingHorizontal:20,paddingTop:20,paddingBottom:10},modalDesktop:{width:'100%',maxWidth:780,maxHeight:'92%',alignSelf:'center',borderRadius:22},formScroll:{flexShrink:1},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:17},modalEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.35,color:C.muted,marginBottom:5},modalTitle:{fontSize:22,fontWeight:'800',color:C.text},closeButton:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:C.panel},formSection:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:C.lime,marginTop:8,marginBottom:11},importPanel:{padding:13,marginBottom:15,borderRadius:13,borderWidth:1,borderColor:'#2B4148',backgroundColor:'#101E26'},importHelp:{fontSize:10,lineHeight:15,color:'#A2B2B8',marginBottom:9},sessionInput:{minHeight:112,maxHeight:170,padding:10,borderRadius:9,borderWidth:1,borderColor:C.line,backgroundColor:'#0B141C',color:C.text,fontSize:10,lineHeight:15},importButton:{height:38,marginTop:9,borderRadius:9,backgroundColor:C.lime,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},importButtonText:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:C.bg},importSummary:{gap:4,padding:9,marginTop:9,borderRadius:9,backgroundColor:'#172821'},importSummaryTitle:{fontSize:8,fontWeight:'900',color:C.green,letterSpacing:.45},importSummaryText:{fontSize:9,color:'#B5C5C3'},formRow:{flexDirection:'row',justifyContent:'space-between',gap:10},fieldWrap:{flex:1,marginBottom:12},fieldLabel:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#A4B2B9',marginBottom:6},fieldHint:{fontSize:8,fontWeight:'800',letterSpacing:.45,color:C.muted,marginBottom:7},input:{height:43,backgroundColor:'#131F29',borderWidth:1,borderColor:'#263640',borderRadius:10,paddingHorizontal:11,color:C.text,fontSize:12,fontWeight:'600'},profileChoices:{gap:7,paddingBottom:12},profileChoice:{minWidth:110,maxWidth:165,paddingVertical:8,paddingHorizontal:10,borderRadius:10,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},profileChoiceActive:{borderColor:'#6D8C4B',backgroundColor:'#263527'},profileChoiceName:{fontSize:10,fontWeight:'800',color:C.text},profileChoiceMeta:{fontSize:8,fontWeight:'700',color:C.muted,marginTop:3},vocRow:{flexDirection:'row',gap:7,marginBottom:10},vocPill:{flex:1,height:35,borderRadius:9,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},vocPillActive:{borderColor:'#6D8C4B',backgroundColor:'#263527'},vocText:{fontSize:10,fontWeight:'800',color:C.muted},vocTextActive:{color:C.lime},primaryToggle:{minHeight:52,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:10,paddingVertical:8,marginBottom:8,borderRadius:11,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},primaryToggleActive:{backgroundColor:'#221F19',borderColor:'#5F5235'},primaryToggleTitle:{fontSize:8,fontWeight:'900',letterSpacing:.45,color:C.text},primaryToggleHint:{fontSize:8,color:C.muted,marginTop:3},checkbox:{width:19,height:19,borderRadius:6,borderWidth:1,borderColor:'#46555D',alignItems:'center',justifyContent:'center'},checkboxActive:{backgroundColor:C.lime,borderColor:C.lime},numberHint:{fontSize:8,lineHeight:12,color:C.muted,marginTop:-5,marginBottom:9},formError:{fontSize:10,lineHeight:15,color:C.red,marginBottom:9},saveButton:{borderRadius:12,overflow:'hidden',marginTop:3},saveGradient:{height:47,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},saveText:{fontSize:10,fontWeight:'900',letterSpacing:.9,color:C.bg},
  rowMain:{flex:1,flexDirection:'row',alignItems:'center'},deleteButton:{width:34,height:36,marginLeft:4,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#FF758614'},
  filters:{gap:8,marginBottom:13},searchBox:{height:42,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:11,borderRadius:11,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},searchInput:{flex:1,height:42,padding:0,color:C.text,fontSize:11},periodCompact:{height:33},dateFilter:{height:40,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:11,borderRadius:11,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},shareHuntRow:{minHeight:68,paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center'},shareHuntRowActive:{backgroundColor:'#1B2A22'},
  profileHero:{minHeight:88,flexDirection:'row',alignItems:'center',gap:13,padding:15,borderRadius:16,borderWidth:1,borderColor:'#4A4431',backgroundColor:'#1B1D1A'},profileHeroIcon:{width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#FFB96718'},profileXp:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10,marginBottom:16,padding:12,borderRadius:12,backgroundColor:'#13232B'},profileXpText:{color:C.cyan,fontSize:10,fontWeight:'700'},profileInput:{height:45,paddingHorizontal:12,marginBottom:14,borderRadius:10,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,color:C.text,fontSize:13,fontWeight:'600'},savedCharacterRow:{minHeight:64,paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center'},
});
