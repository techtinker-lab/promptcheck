import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, FileCode, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { api } from '../../lib/api-client.js';
import type { Contract, Project, TestCase } from '../../types.js';
import { ContractModal } from './ContractModal.js';

export function ContractsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  // 1. Fetch Project
  const { data: projectData } = useQuery<{ project: Project }>({
    queryKey: ['project', slug],
    queryFn: () => api.get<{ project: Project }>(`/api/v1/projects/${slug}`),
    enabled: Boolean(slug),
  });

  const project = projectData?.project;

  // 2. Fetch Contracts
  const { data: contractsData, isLoading } = useQuery<{ contracts: Contract[] }>({
    queryKey: ['contracts', slug],
    queryFn: () => api.get<{ contracts: Contract[] }>(`/api/v1/projects/${slug}/contracts`),
    enabled: Boolean(slug),
  });

  // 3. Save Mutation (Create or Update)
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      slug: string;
      prompt_name: string;
      description?: string;
      json_schema: Record<string, unknown>;
      test_cases: TestCase[];
    }) => {
      if (editingContract) {
        return api.put<{ contract: Contract }>(
          `/api/v1/projects/${slug}/contracts/${editingContract.id}`,
          payload
        );
      }
      return api.post<{ contract: Contract }>(`/api/v1/projects/${slug}/contracts`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', slug] });
      setIsModalOpen(false);
      setEditingContract(null);
    },
  });

  // 4. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (contractId: string) =>
      api.delete<{ success: boolean }>(`/api/v1/projects/${slug}/contracts/${contractId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', slug] });
    },
  });

  const handleEdit = (contract: Contract) => {
    setEditingContract(contract);
    setIsModalOpen(true);
  };

  const handleDelete = (contract: Contract) => {
    if (window.confirm(`Tem certeza que deseja excluir o contrato "${contract.prompt_name}"?`)) {
      deleteMutation.mutate(contract.id);
    }
  };

  const contracts = contractsData?.contracts || [];

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Header */}
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('nav.projects')}</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                {t('contracts.title')}
              </h1>
              {project && (
                <Badge variant="neutral" size="sm">
                  {project.slug}
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-400 mt-1">{t('contracts.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to={`/projects/${slug}/runs`}>
              <Button variant="secondary" size="sm">
                <Play className="w-3.5 h-3.5" />
                {t('nav.runs')}
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => {
                setEditingContract(null);
                setIsModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              {t('contracts.newContract')}
            </Button>
          </div>
        </div>
      </div>

      {/* Contracts List */}
      {isLoading ? (
        <div className="py-16 text-center text-zinc-500 font-mono text-sm">
          {t('common.loading')}
        </div>
      ) : contracts.length === 0 ? (
        <Card className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400 mb-4">
            <FileCode className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-zinc-200">{t('contracts.title')}</h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1 mb-6">
            {t('contracts.noContracts')}
          </p>
          <Button
            onClick={() => {
              setEditingContract(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            {t('contracts.newContract')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {contracts.map((contract) => {
            const casesCount = Array.isArray(contract.test_cases) ? contract.test_cases.length : 0;
            return (
              <Card
                key={contract.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-semibold text-zinc-100">
                      {contract.prompt_name}
                    </h3>
                    <Badge variant="pass" size="sm">
                      v{contract.version}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
                    <span>
                      slug: <strong className="text-zinc-200">{contract.slug}</strong>
                    </span>
                    <span>•</span>
                    <span>{casesCount} casos sintéticos</span>
                  </div>
                  {contract.description && (
                    <p className="text-xs text-zinc-400 mt-1 max-w-2xl">{contract.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(contract)}>
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-rose-400"
                    onClick={() => handleDelete(contract)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Contract Create/Edit Modal */}
      {isModalOpen && (
        <ContractModal
          contract={editingContract}
          onClose={() => {
            setIsModalOpen(false);
            setEditingContract(null);
          }}
          onSave={async (data) => {
            await saveMutation.mutateAsync(data);
          }}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}
