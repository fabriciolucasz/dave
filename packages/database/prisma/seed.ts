// packages/database/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de planos de assinatura...');

  const plans = [
    {
      code: 'free',
      name: 'Gratuito',
      priceCents: 0,
      currency: 'BRL',
      features: {
        maxActiveContainers: 1,
        customWebhookEnabled: false,
        queuePriority: false,
        maxBillingAdmins: 1,
      },
    },
    {
      code: 'pro',
      name: 'Pro',
      priceCents: 2990,
      currency: 'BRL',
      features: {
        maxActiveContainers: -1, // Ilimitado
        customWebhookEnabled: true,
        queuePriority: false,
        maxBillingAdmins: 1,
      },
    },
    {
      code: 'business',
      name: 'Business',
      priceCents: 9990,
      currency: 'BRL',
      features: {
        maxActiveContainers: -1, // Ilimitado
        customWebhookEnabled: true,
        queuePriority: true,
        maxBillingAdmins: 5,
      },
    },
  ];

  for (const plan of plans) {
    const upserted = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        features: plan.features,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        features: plan.features,
      },
    });
    console.log(`Plano cadastrado/atualizado: ${upserted.code} (${upserted.name})`);
  }

  console.log('Seed de planos concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
