import type { RunContractReport, RunReportResponse } from '@promptcheck/shared';

export interface MarkdownSummaryOptions {
  projectName: string;
  reports: RunContractReport[];
  failUnder: number;
  uploadData?: RunReportResponse | undefined;
  branch?: string | undefined;
  commitSha?: string | undefined;
}

export function generateMarkdownSummary(options: MarkdownSummaryOptions): string {
  const { projectName, reports, failUnder, uploadData, branch, commitSha } = options;

  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;
  let totalCost = 0;
  let totalLatency = 0;

  for (const report of reports) {
    totalCases += report.total_cases;
    passedCases += report.passed_cases;
    failedCases += report.failed_cases;
    totalCost += Number(report.cost_usd);
    totalLatency += report.avg_latency_ms;
  }

  const avgLatency = reports.length > 0 ? Math.round(totalLatency / reports.length) : 0;
  const overallPassRate = totalCases > 0 ? (passedCases / totalCases) * 100 : 100;
  const hasDrift = uploadData?.drift_detected ?? false;
  const isPassing = overallPassRate >= failUnder && failedCases === 0;

  const statusBadge = hasDrift
    ? '⚠️ **DRIFT ALERT**'
    : isPassing
      ? '✅ **PASSED**'
      : '❌ **FAILED**';

  const lines: string[] = [];

  lines.push(`## 🛡️ PromptCheck Test Report — \`${projectName}\``);
  lines.push('');
  lines.push(
    `**Status:** ${statusBadge} | **Taxa de Sucesso:** \`${overallPassRate.toFixed(1)}%\` (Mínimo: \`${failUnder}%\`)`
  );
  if (branch || commitSha) {
    lines.push(
      `**Git:** \`${branch || 'unknown'}\` @ \`${commitSha ? commitSha.slice(0, 7) : 'head'}\``
    );
  }
  lines.push('');

  // Overview Table
  lines.push('| Métrica | Valor |');
  lines.push('|---|---|');
  lines.push(
    `| **Casos Aprovados** | \`${passedCases} / ${totalCases}\` (${overallPassRate.toFixed(1)}%) |`
  );
  lines.push(`| **Latência Média** | \`${avgLatency}ms\` |`);
  lines.push(`| **Custo Estimado** | \`$${totalCost.toFixed(4)} USD\` |`);
  lines.push(`| **Total de Contratos** | \`${reports.length}\` |`);
  lines.push('');

  // Contract Breakdown Table
  lines.push('### 📋 Detalhe por Contrato');
  lines.push('');
  lines.push('| Contrato | Versão | Modelo | Casos | Taxa | Latência | Custo | Status |');
  lines.push('|---|---|---|---|---|---|---|---|');

  for (const r of reports) {
    const rate = Number(r.pass_rate).toFixed(1);
    const contractStatus = r.failed_cases === 0 ? '✅ Pass' : '❌ Fail';
    lines.push(
      `| \`${r.slug}\` | v${r.contract_version} | \`${r.model}\` | ${r.passed_cases}/${r.total_cases} | ${rate}% | ${r.avg_latency_ms}ms | $${Number(r.cost_usd).toFixed(4)} | ${contractStatus} |`
    );
  }
  lines.push('');

  // Drift Warnings
  if (hasDrift) {
    lines.push('### ⚠️ Alerta de Model Drift Detectado');
    lines.push('');
    lines.push('> [!WARNING]');
    lines.push(
      '> O provedor de IA atualizou o modelo ou o comportamento sofreu alteração silenciosa em relação à baseline da branch principal.'
    );
    lines.push('');
  }

  // Failed Cases Table (Privacy by Design!)
  const allFailures = reports.flatMap((r) =>
    r.case_results
      .filter((c) => c.status === 'fail')
      .flatMap((c) =>
        c.errors.map((e) => ({
          contract: r.slug,
          caseId: c.case_id,
          jsonPath: e.json_path || '$',
          rule: e.rule_violated,
          expected: e.expected_type,
          received: e.received_type,
        }))
      )
  );

  if (allFailures.length > 0) {
    lines.push('### ❌ Violações de Contrato');
    lines.push('');
    lines.push('| Contrato | Caso | JSON Path | Regra Violada | Esperado | Recebido |');
    lines.push('|---|---|---|---|---|---|');
    for (const f of allFailures) {
      lines.push(
        `| \`${f.contract}\` | \`${f.caseId}\` | \`${f.jsonPath}\` | **${f.rule}** | \`${f.expected}\` | \`${f.received}\` |`
      );
    }
    lines.push('');
    lines.push(
      '*Privacy by Design: Valores em texto puro e outputs da LLM nunca são expostos em relatórios.*'
    );
    lines.push('');
  }

  // Dashboard Link
  if (uploadData?.dashboard_url) {
    lines.push('---');
    lines.push(
      `🔍 [Abrir detalhes completos da execução no Dashboard PromptCheck](${uploadData.dashboard_url})`
    );
  }

  return lines.join('\n');
}
