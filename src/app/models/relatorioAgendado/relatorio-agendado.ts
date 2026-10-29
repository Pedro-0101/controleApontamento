export interface RelatorioAgendado {
  id: number;
  nome: string;
  status: string[];
  empresa_id: number | null;
  empresa_nome: string | null;
  local_id: number | null;
  local_nome: string | null;
  dias_semana: number[];
  hora: string;
  dia_referencia: number;
  numeros: string[];
  ativo: number;
  ultimo_envio: string | null;
}

export interface RelatorioAgendadoPayload {
  nome: string;
  status: string[];
  empresa_id: number | null;
  empresa_nome: string | null;
  local_id: number | null;
  local_nome: string | null;
  dias_semana: number[];
  hora: string;
  dia_referencia: number;
  numeros: string[];
  ativo: number;
}

export interface WhatsappLogEntry {
  at: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

export interface WhatsappStatus {
  available: boolean;
  ready: boolean;
  starting: boolean;
  stage: string;
  startedAt: string | null;
  elapsedMs: number | null;
  hasQr: boolean;
  qr: string | null;
  qrDataUrl: string | null;
  qrAt: string | null;
  me: string | null;
  browserPath: string | null;
  error: string | null;
  errorAt: string | null;
  logs: WhatsappLogEntry[];
}

export interface TesteRelatorioResult {
  total: number;
  message: string;
  envio: { number: string; success: boolean; error?: string }[] | { success: boolean; error: string } | null;
}
