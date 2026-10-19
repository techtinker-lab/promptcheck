import type { RunContractReport } from '@promptcheck/shared';
import pc from 'picocolors';
import { t } from '../i18n/index.js';

export function maskSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***[REDACTED]***')
    .replace(/pck_live_[a-zA-Z0-9]{20,}/g, 'pck_live_***[REDACTED]***');
}

export function printHeader(): void {
  console.log(pc.bold(pc.cyan('\n🔍 PromptCheck CLI')) + pc.gray(' — TechTinker\n'));
}

export function printContractResult(report: RunContractReport): void {
  const isPass = report.failed_cases === 0;
  const statusIcon = isPass ? pc.green('✓') : pc.red('✗');
  const slugText = pc.bold(report.slug);
  const rateText = isPass ? pc.green(`${report.pass_rate}%`) : pc.red(`${report.pass_rate}%`);

  console.log(
    `  ${statusIcon} ${slugText} [v${report.contract_version}] — ${rateText} (${report.passed_cases}/${report.total_cases} passed)`
  );
  console.log(
    pc.gray(
      `    model: ${report.model} | latência: ${report.avg_latency_ms}ms | tokens: ${report.input_tokens + report.output_tokens}`
    )
  );

  if (report.failed_cases > 0) {
    for (const testCase of report.case_results) {
      if (testCase.status === 'fail') {
        console.log(pc.red(`    ✗ Caso ${testCase.case_id}:`));
        for (const err of testCase.errors) {
          console.log(
            pc.gray(
              `      - [${err.rule_violated}] ${err.json_path}: esperado ${err.expected_type}, recebido ${err.received_type}`
            )
          );
        }
      }
    }
  }
  console.log('');
}

export function printSummary(reports: RunContractReport[], failUnder: number): boolean {
  const totalCases = reports.reduce((acc, r) => acc + r.total_cases, 0);
  const passedCases = reports.reduce((acc, r) => acc + r.passed_cases, 0);
  const overallPassRate =
    totalCases > 0 ? Number(((passedCases / totalCases) * 100).toFixed(2)) : 0;
  const totalCost = reports.reduce((acc, r) => acc + r.cost_usd, 0);

  const passedThreshold = overallPassRate >= failUnder;

  console.log(pc.bold('─'.repeat(60)));
  console.log(pc.bold(`📊 ${t('summaryTitle')}`));
  console.log(`  Contratos testados:  ${pc.bold(String(reports.length))}`);
  console.log(
    `  Casos de teste:      ${pc.green(`${passedCases} passaram`)}, ${pc.red(`${totalCases - passedCases} falharam`)}`
  );
  console.log(
    `  Taxa de sucesso:     ${passedThreshold ? pc.green(`${overallPassRate}%`) : pc.red(`${overallPassRate}%`)} (mínimo: ${failUnder}%)`
  );
  console.log(`  Custo estimado:      $${totalCost.toFixed(6)} USD`);
  console.log(pc.bold('─'.repeat(60)));

  if (!passedThreshold) {
    console.log(pc.red(`\n❌ ${t('exitCodeFail')}\n`));
    return false;
  }

  console.log(pc.green(`\n✓ Todos os contratos atenderam ao limiar fail_under (${failUnder}%).\n`));
  return true;
}
