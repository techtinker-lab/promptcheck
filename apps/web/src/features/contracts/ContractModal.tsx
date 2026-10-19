import { AlertTriangle, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import type { Assertion, Contract, TestCase } from '../../types.js';

export interface ContractModalProps {
  contract?: Contract | null;
  onClose: () => void;
  onSave: (data: {
    slug: string;
    prompt_name: string;
    description?: string;
    json_schema: Record<string, unknown>;
    test_cases: TestCase[];
  }) => Promise<void>;
  isSaving: boolean;
}

const DEFAULT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    categoria: {
      type: 'string',
      enum: ['FINANCEIRO', 'SUPORTE', 'VENDAS', 'OUTROS'],
    },
    urgente: {
      type: 'boolean',
    },
    resumo: {
      type: 'string',
    },
  },
  required: ['categoria', 'urgente', 'resumo'],
  additionalProperties: false,
};

export function ContractModal({ contract, onClose, onSave, isSaving }: ContractModalProps) {
  const { t } = useTranslation();

  const [slug, setSlug] = useState(contract?.slug || '');
  const [promptName, setPromptName] = useState(contract?.prompt_name || '');
  const [description, setDescription] = useState(contract?.description || '');

  const [schemaText, setSchemaText] = useState(
    contract
      ? JSON.stringify(contract.json_schema, null, 2)
      : JSON.stringify(DEFAULT_JSON_SCHEMA, null, 2)
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [testCases, setTestCases] = useState<TestCase[]>(
    (contract?.test_cases as TestCase[]) || [
      {
        id: 'tc_sample_1',
        name: 'Caso de Teste Básico',
        input: { texto: 'Cliente solicitando estorno de fatura' },
        assertions: [
          {
            type: 'equals',
            path: '$.categoria',
            value: 'FINANCEIRO',
          },
        ],
      },
    ]
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Test Case form helpers
  const addTestCase = () => {
    setTestCases([
      ...testCases,
      {
        id: `tc_${Date.now()}`,
        name: `Novo Caso ${testCases.length + 1}`,
        input: {},
        assertions: [],
      },
    ]);
  };

  const removeTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const updateTestCaseName = (index: number, name: string) => {
    const updated = [...testCases];
    const item = updated[index];
    if (item) {
      item.name = name;
      setTestCases(updated);
    }
  };

  const updateTestCaseInput = (index: number, rawJson: string) => {
    const updated = [...testCases];
    const item = updated[index];
    if (item) {
      try {
        item.input = JSON.parse(rawJson);
      } catch {
        // Keep object as is or update dirty
      }
      setTestCases(updated);
    }
  };

  const addAssertion = (caseIndex: number) => {
    const updated = [...testCases];
    const item = updated[caseIndex];
    if (item) {
      item.assertions = [
        ...(item.assertions || []),
        { type: 'equals', path: '$.campo', value: 'valor' },
      ];
      setTestCases(updated);
    }
  };

  const updateAssertion = (
    caseIndex: number,
    assertionIndex: number,
    field: string,
    val: unknown
  ) => {
    const updated = [...testCases];
    const item = updated[caseIndex];
    if (item?.assertions?.[assertionIndex]) {
      const targetAssertion = { ...item.assertions[assertionIndex] } as Record<string, unknown>;
      targetAssertion[field] = val;
      item.assertions[assertionIndex] = targetAssertion as unknown as Assertion;
      setTestCases(updated);
    }
  };

  const removeAssertion = (caseIndex: number, assertionIndex: number) => {
    const updated = [...testCases];
    const item = updated[caseIndex];
    if (item?.assertions) {
      item.assertions = item.assertions.filter((_, i) => i !== assertionIndex);
      setTestCases(updated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSchemaError(null);

    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(schemaText);
    } catch {
      setSchemaError('JSON Schema inválido: verifique a sintaxe JSON');
      return;
    }

    try {
      await onSave({
        slug: slug.trim(),
        prompt_name: promptName.trim() || slug.trim(),
        description: description.trim() || undefined,
        json_schema: parsedSchema,
        test_cases: testCases,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar contrato');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-4xl bg-zinc-900 border-zinc-800 shadow-2xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {contract ? 'Editar Contrato' : t('contracts.newContract')}
            </h2>
            <p className="text-xs text-zinc-400">{t('contracts.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* Basic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="contract-slug"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                {t('contracts.slug')} <span className="text-rose-400">*</span>
              </label>
              <input
                id="contract-slug"
                type="text"
                required
                disabled={Boolean(contract)}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                placeholder="extrator-nota-fiscal"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono disabled:opacity-60"
              />
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                Deve corresponder à chave no promptcheck.yaml
              </span>
            </div>

            <div>
              <label
                htmlFor="contract-prompt-name"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                {t('contracts.promptName')} <span className="text-rose-400">*</span>
              </label>
              <input
                id="contract-prompt-name"
                type="text"
                required
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                placeholder="Extrator de Notas Fiscais"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
              />
            </div>
          </div>

          <div>
            <label htmlFor="contract-desc" className="block text-xs font-medium text-zinc-300 mb-1">
              {t('contracts.description')}
            </label>
            <input
              id="contract-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contrato de extração estruturada de dados de NF"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
            />
          </div>

          {/* JSON Schema Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="contract-schema" className="text-xs font-semibold text-zinc-200">
                {t('contracts.jsonSchema')}
              </label>
              <Badge variant="neutral" size="sm">
                JSON Schema Draft 2020-12
              </Badge>
            </div>
            {schemaError && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{schemaError}</span>
              </div>
            )}
            <textarea
              id="contract-schema"
              rows={8}
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
            />
          </div>

          {/* Test Cases Section (Synthetic Gold Dataset) */}
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{t('contracts.testCases')}</h3>
                <span className="text-xs text-zinc-400">
                  Casos de teste sintéticos executados pela CLI
                </span>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addTestCase}>
                <Plus className="w-3.5 h-3.5" />
                {t('contracts.addTestCase')}
              </Button>
            </div>

            {/* PII / LGPD Warning Banner */}
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/80 flex items-start gap-3 text-amber-300 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold block text-amber-200">
                  Aviso de Privacidade & LGPD:
                </span>
                <span>{t('contracts.piiWarning')}</span>
              </div>
            </div>

            {/* Test Case Cards */}
            <div className="space-y-4">
              {testCases.map((tc, caseIdx) => (
                <div
                  key={tc.id || caseIdx}
                  className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <label
                        htmlFor={`tc-name-${tc.id || caseIdx}`}
                        className="text-[10px] font-mono text-zinc-500 uppercase block mb-1"
                      >
                        {t('contracts.caseName')}
                      </label>
                      <input
                        id={`tc-name-${tc.id || caseIdx}`}
                        type="text"
                        value={tc.name}
                        onChange={(e) => updateTestCaseName(caseIdx, e.target.value)}
                        placeholder="Nome descritivo do caso"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTestCase(caseIdx)}
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded transition-colors self-end"
                      title="Remover Caso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Input JSON */}
                  <div>
                    <label
                      htmlFor={`tc-input-${tc.id || caseIdx}`}
                      className="text-[10px] font-mono text-zinc-500 uppercase block mb-1"
                    >
                      {t('contracts.caseInput')}
                    </label>
                    <textarea
                      id={`tc-input-${tc.id || caseIdx}`}
                      rows={3}
                      defaultValue={JSON.stringify(tc.input, null, 2)}
                      onBlur={(e) => updateTestCaseInput(caseIdx, e.target.value)}
                      placeholder='{"variavel": "valor"}'
                      className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-normal"
                    />
                  </div>

                  {/* Assertions */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-zinc-300">
                        {t('contracts.caseAssertions')} ({tc.assertions?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => addAssertion(caseIdx)}
                        className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Nova Asserção
                      </button>
                    </div>

                    {(tc.assertions || []).map((ass, assIdx) => (
                      <div
                        key={`tc-assertion-${tc.id || caseIdx}-${ass.path}-${assIdx}`}
                        className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 rounded p-2 text-xs"
                      >
                        <select
                          value={ass.type}
                          onChange={(e) => updateAssertion(caseIdx, assIdx, 'type', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                        >
                          <option value="equals">equals</option>
                          <option value="contains">contains</option>
                          <option value="not_null">not_null</option>
                          <option value="regex">regex</option>
                          <option value="in_enum">in_enum</option>
                        </select>

                        <input
                          type="text"
                          value={ass.path}
                          onChange={(e) => updateAssertion(caseIdx, assIdx, 'path', e.target.value)}
                          placeholder="$.caminho"
                          className="w-32 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                        />

                        {ass.type !== 'not_null' && (
                          <input
                            type="text"
                            value={String('value' in ass ? (ass.value ?? '') : '')}
                            onChange={(e) =>
                              updateAssertion(caseIdx, assIdx, 'value', e.target.value)
                            }
                            placeholder="valor esperado"
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => removeAssertion(caseIdx, assIdx)}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
