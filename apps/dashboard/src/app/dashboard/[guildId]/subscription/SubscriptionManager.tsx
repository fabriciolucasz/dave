// apps/dashboard/src/app/dashboard/[guildId]/subscription/SubscriptionManager.tsx
'use client';

import { useState } from 'react';
import { createCheckoutSession, cancelActiveSubscription } from './actions';
import { Sparkles, CircleCheck, CircleAlert, Check, CreditCard, Power, X } from 'lucide-react';

interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  features: any;
}

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string;
  createdByUserId: string;
  plan: {
    id: string;
    name: string;
    code: string;
  };
}

interface SubscriptionManagerProps {
  guildId: string;
  userId: string;
  isOwner: boolean;
  activeSubscription: Subscription | null;
  plans: Plan[];
}

export function SubscriptionManager({
  guildId,
  userId,
  isOwner,
  activeSubscription,
  plans,
}: SubscriptionManagerProps) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowedToCancel =
    activeSubscription && (activeSubscription.createdByUserId === userId || isOwner);

  const handleSubscribe = async (planId: string) => {
    setError(null);
    setLoadingPlanId(planId);

    const result = await createCheckoutSession(guildId, planId);
    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    } else {
      setError(result.error || 'Erro ao iniciar checkout.');
      setLoadingPlanId(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Deseja realmente cancelar sua assinatura? O acesso premium será bloqueado ao final do período.')) {
      return;
    }

    setError(null);
    setCanceling(true);

    const result = await cancelActiveSubscription(guildId);
    setCanceling(false);

    if (!result.success) {
      setError(result.error || 'Erro ao cancelar assinatura.');
    }
  };

  const renderFeatureText = (key: string, val: any) => {
    if (key === 'maxActiveContainers') {
      return val === -1 ? 'Painéis Ilimitados' : `Máximo de ${val} Painel Ativo`;
    }
    if (key === 'customWebhookEnabled') {
      return val ? 'Webhook Customizado (Identidade Própria)' : 'Sem Webhook Customizado';
    }
    if (key === 'queuePriority') {
      return val ? 'Fila de Processamento Prioritária' : 'Fila de Processamento Normal';
    }
    if (key === 'maxBillingAdmins') {
      return val === 1 ? '1 Administrador de Faturamento' : `Até ${val} Administradores de Faturamento`;
    }
    return `${key}: ${JSON.stringify(val)}`;
  };

  return (
    <div style={styles.container} className="animate-fade-in">
      {error && (
        <div style={styles.alert} className="badge-inactive">
          <CircleAlert size={16} aria-hidden="true" style={{ marginRight: '8px' }} /> {error}
        </div>
      )}

      {/* Assinatura Ativa */}
      {activeSubscription ? (
        <div style={styles.activeSubCard} className="card-glass">
          <div style={styles.subHeader}>
            <span style={styles.badgeLabel}>
              <Sparkles size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> Plano Ativo
            </span>
            <h2 style={styles.planName}>{activeSubscription.plan.name}</h2>
          </div>
          <div style={styles.subDetails}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Status</span>
              <span className="badge badge-active">
                <CircleCheck size={12} aria-hidden="true" style={{ marginRight: '4px' }} /> {activeSubscription.status}
              </span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Renovação / Expiração</span>
              <span style={styles.detailValue}>
                {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>

          <div style={styles.actionsBlock}>
            {isAllowedToCancel ? (
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="btn btn-danger"
                style={styles.actionBtn}
              >
                <Power size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
                {canceling ? 'Cancelando...' : 'Cancelar Assinatura'}
              </button>
            ) : (
              <div style={styles.disabledBlock}>
                <button disabled className="btn btn-danger" style={styles.actionBtn}>
                  <Power size={14} aria-hidden="true" style={{ marginRight: '6px' }} /> Cancelar Assinatura
                </button>
                <p style={styles.disabledText}>
                  Apenas o criador da assinatura ou o dono do servidor têm permissão para cancelar.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Listagem de Planos para Assinar */
        <div style={styles.plansSection}>
          <h3 style={styles.sectionTitle}>Escolha um Plano</h3>
          <p style={styles.sectionSubtitle}>
            Adquira uma assinatura premium via Mercado Pago para liberar todas as ferramentas no seu servidor.
          </p>

          <div style={styles.plansGrid}>
            {plans.map((plan) => {
              const isPro = plan.code !== 'free';
              return (
                <div
                  key={plan.id}
                  style={{
                    ...styles.planCard,
                    ...(isPro ? styles.proPlanCard : {}),
                  }}
                  className="card-glass"
                >
                  {isPro && (
                    <div style={styles.recommendedBadge}>
                      <Sparkles size={10} /> RECOMENDADO
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isPro && <Sparkles size={16} style={{ color: '#ffc44f' }} />}
                    <h4 style={styles.planTitle}>{plan.name}</h4>
                  </div>
                  <div style={styles.priceRow}>
                    <span style={styles.priceVal}>R$ {(plan.priceCents / 100).toFixed(2)}</span>
                    <span style={styles.priceUnit}>/ mês</span>
                  </div>
                  
                  {/* Features list */}
                  <div style={styles.featuresList}>
                    {plan.features &&
                      Object.entries(plan.features).map(([key, val]) => {
                        const hasFeature = typeof val === 'boolean' ? val : val !== 0;
                        return (
                          <div key={key} style={styles.featureItem}>
                            {hasFeature ? (
                              <Check size={14} style={{ color: '#2ec46d', marginRight: '6px', display: 'inline' }} />
                            ) : (
                              <X size={14} style={{ color: '#da373c', marginRight: '6px', display: 'inline' }} />
                            )}
                            <span style={{ color: hasFeature ? '#dbdee1' : '#6e7681' }}>
                              {renderFeatureText(key, val)}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loadingPlanId !== null || plan.code === 'free'}
                    className="btn btn-primary"
                    style={{
                      ...styles.subscribeBtn,
                      ...(isPro ? styles.proSubscribeBtn : {}),
                    }}
                  >
                    {plan.code === 'free' ? (
                      'Plano Inicial Ativo'
                    ) : loadingPlanId === plan.id ? (
                      'Carregando...'
                    ) : (
                      <>
                        <CreditCard size={14} aria-hidden="true" style={{ marginRight: '6px' }} /> Assinar Agora
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    width: '100%',
  },
  alert: {
    padding: '16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'rgba(218, 55, 60, 0.1)',
    color: '#f25c60',
    border: '1px solid rgba(218, 55, 60, 0.2)',
  },
  activeSubCard: {
    padding: '32px',
    maxWidth: '560px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  subHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  badgeLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#5865f2',
    textTransform: 'uppercase',
  },
  planName: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#ffffff',
  },
  subDetails: {
    display: 'flex',
    gap: '40px',
    padding: '20px 0',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6e7681',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ffffff',
  },
  actionsBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
  },
  disabledBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  disabledText: {
    fontSize: '12px',
    color: '#6e7681',
    lineHeight: 1.4,
  },
  actionBtn: {
    padding: '12px 24px',
  },
  plansSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  sectionSubtitle: {
    fontSize: '14px',
    color: '#949ba4',
    marginBottom: '24px',
  },
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '32px',
    maxWidth: '800px',
  },
  planCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '16px',
    padding: '40px 32px',
    position: 'relative',
  },
  proPlanCard: {
    borderColor: '#ffc44f',
    background: 'linear-gradient(135deg, rgba(255, 196, 79, 0.05) 0%, rgba(21, 23, 35, 0.8) 100%)',
    boxShadow: '0 8px 32px rgba(255, 196, 79, 0.08)',
  },
  recommendedBadge: {
    position: 'absolute',
    top: '-12px',
    background: '#ffc44f',
    color: '#000000',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '10px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  planTitle: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#ffffff',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  priceVal: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#ffffff',
  },
  priceUnit: {
    fontSize: '14px',
    color: '#6e7681',
  },
  featuresList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'flex-start',
    fontSize: '13px',
    color: '#dbdee1',
    padding: '24px 0',
    width: '100%',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    flex: 1,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    textAlign: 'left',
  },
  subscribeBtn: {
    width: '100%',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 700,
  },
  proSubscribeBtn: {
    background: '#ffc44f',
    color: '#000000',
    borderColor: '#ffc44f',
  },
};
