#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runTest } from './commands/test.js';

const program = new Command();

program
  .name('promptcheck')
  .description('PromptCheck — CLI de testes de contrato e detecção de drift para prompts de IA')
  .version('0.1.0');

program
  .command('init')
  .description('Inicializa o arquivo promptcheck.yaml e o workflow do GitHub Actions')
  .option('--lang <lang>', 'Idioma das mensagens e configurações (pt ou en)')
  .action(async (options) => {
    try {
      await runInit(options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Executa os testes de contrato contra os prompts locais e envia o relatório ao SaaS')
  .option('-c, --config <path>', 'Caminho do arquivo de configuração (padrão: promptcheck.yaml)')
  .option('--fail-under <number>', 'Limiar percentual mínimo de sucesso para aprovar o CI')
  .option('--only <slugs>', 'Filtra execução para contratos específicos separados por vírgula')
  .option('--no-upload', 'Executa os testes apenas localmente sem enviar telemetria para o SaaS')
  .option('--lang <lang>', 'Idioma das mensagens de saída no terminal (pt ou en)')
  .action(async (options) => {
    try {
      await runTest(options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parse(process.argv);
