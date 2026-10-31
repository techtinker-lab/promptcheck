export const translations = {
  en: {
    initSuccess: 'Initialized PromptCheck configuration in promptcheck.yaml',
    initWorkflowCreated: 'Created GitHub Actions workflow in .github/workflows/promptcheck.yml',
    initGitignoreUpdated: 'Added .env to .gitignore',
    initInstructions:
      'Next steps:\n1. Set PROMPTCHECK_TOKEN in your environment or GitHub Secrets\n2. Set OPENAI_API_KEY in your environment\n3. Run: npx promptcheck test',
    configNotFound: 'Configuration file promptcheck.yaml not found. Run "promptcheck init" first.',
    configInvalid: 'Invalid configuration in promptcheck.yaml',
    tokenMissing: 'Environment variable PROMPTCHECK_TOKEN is not set.',
    apiKeyMissing: 'Environment variable OPENAI_API_KEY is not set.',
    insecureApiUrl: 'Security Error: api_url must use HTTPS (HTTP is only allowed for localhost).',
    projectMismatch:
      'Project mismatch: the provided token belongs to "{serverProject}", but promptcheck.yaml specifies "{localProject}".',
    fetchingContracts: 'Fetching contracts from PromptCheck Control Plane...',
    noContractsFound: 'No active contracts found for this project.',
    runningTests: 'Running contract tests...',
    contractPassed: 'Contract passed',
    contractFailed: 'Contract failed',
    contractDrift: 'Warning: Model drift detected',
    summaryTitle: 'Test Execution Summary',
    exitCodeFail: 'Test suite failed because pass rate fell below the fail_under threshold.',
    uploadSuccess: 'Results uploaded to PromptCheck SaaS Dashboard:',
    uploadSkipped: 'Upload skipped (--no-upload flag enabled).',
  },
  pt: {
    initSuccess: 'Configuração do PromptCheck inicializada em promptcheck.yaml',
    initWorkflowCreated: 'Workflow do GitHub Actions criado em .github/workflows/promptcheck.yml',
    initGitignoreUpdated: '.env adicionado ao .gitignore',
    initInstructions:
      'Próximos passos:\n1. Defina PROMPTCHECK_TOKEN no seu ambiente ou nos Secrets do GitHub\n2. Defina OPENAI_API_KEY no seu ambiente\n3. Execute: npx promptcheck test',
    configNotFound:
      'Arquivo de configuração promptcheck.yaml não encontrado. Execute "promptcheck init" primeiro.',
    configInvalid: 'Configuração inválida no promptcheck.yaml',
    tokenMissing: 'Variável de ambiente PROMPTCHECK_TOKEN não está definida.',
    apiKeyMissing: 'Variável de ambiente OPENAI_API_KEY não está definida.',
    insecureApiUrl:
      'Erro de Segurança: api_url deve utilizar HTTPS (HTTP é permitido exclusivamente para localhost).',
    projectMismatch:
      'Incompatibilidade de projeto: o token fornecido pertence a "{serverProject}", mas o promptcheck.yaml especifica "{localProject}".',
    fetchingContracts: 'Buscando contratos no Control Plane do PromptCheck...',
    noContractsFound: 'Nenhum contrato ativo encontrado para este projeto.',
    runningTests: 'Executando testes de contrato...',
    contractPassed: 'Contrato aprovado',
    contractFailed: 'Contrato falhou',
    contractDrift: 'Aviso: Deriva de modelo (drift) detectada',
    summaryTitle: 'Resumo da Execução de Testes',
    exitCodeFail:
      'A suíte de testes falhou pois a taxa de sucesso ficou abaixo do limiar fail_under.',
    uploadSuccess: 'Resultados enviados para o Dashboard do PromptCheck:',
    uploadSkipped: 'Envio ignorado (flag --no-upload ativa).',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
export type Locale = 'en' | 'pt';
