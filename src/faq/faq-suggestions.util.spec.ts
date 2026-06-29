import { rankFaqSuggestions, type FaqSuggestionCandidate } from './faq-suggestions.util';

const BASE_ITEM: FaqSuggestionCandidate = {
  id: 'faq-base',
  question: 'Question generique',
  answer: 'Reponse generique',
  category: 'general',
  tags: ['priority:medium'],
  viewCount: 0,
  helpfulCount: 0,
};

function item(partial: Partial<FaqSuggestionCandidate>): FaqSuggestionCandidate {
  return { ...BASE_ITEM, ...partial };
}

describe('rankFaqSuggestions', () => {
  it('ranks contextually relevant questions first', () => {
    const ranked = rankFaqSuggestions(
      [
        item({
          id: 'faq-auth',
          question: 'Comment reinitialiser mon mot de passe ?',
          answer: 'Depuis la page de connexion.',
          category: 'auth',
          tags: ['priority:high'],
        }),
        item({
          id: 'faq-dashboard',
          question: 'Pourquoi je n ai pas acces a certaines pages du dashboard ?',
          answer: 'Verifiez vos permissions.',
          category: 'dashboard',
          tags: ['priority:medium'],
        }),
      ],
      'Portfolio Overview dashboard permissions',
      2,
    );

    expect(ranked[0]?.id).toBe('faq-dashboard');
  });

  it('falls back to popular published questions when context is empty', () => {
    const ranked = rankFaqSuggestions(
      [
        item({ id: 'faq-low', helpfulCount: 1 }),
        item({ id: 'faq-high', helpfulCount: 10, tags: ['priority:high'] }),
      ],
      '',
      1,
    );

    expect(ranked[0]?.id).toBe('faq-high');
  });

  it('does not collapse to a single false-positive command/commande match', () => {
    const ranked = rankFaqSuggestions(
      [
        item({
          id: 'faq-billing',
          question: "Comment voir l'addition ?",
          category: 'billing',
          tags: ['addition'],
        }),
        item({
          id: 'faq-order',
          question: 'Comment faire une commande ?',
          category: 'Commande',
          tags: ['commande'],
        }),
        item({
          id: 'faq-subscription',
          question: 'Comment payer mon abonnement ?',
          category: 'billing',
          tags: ['abonnement'],
        }),
        item({
          id: 'faq-name',
          question: 'Comment changer mon nom',
          category: 'support',
          tags: ['nom'],
        }),
        item({
          id: 'faq-profile',
          question: 'Comment modifier les informations de mon profil ?',
          category: 'support',
          tags: ['settings'],
        }),
      ],
      'Portfolio Overview ORBIT CRM Customer Success Command Center',
      4,
    );

    expect(ranked).toHaveLength(4);
    expect(ranked[0]?.id).not.toBe('faq-order');
  });

  it('pads contextual matches up to the requested limit', () => {
    const ranked = rankFaqSuggestions(
      [
        item({
          id: 'faq-billing',
          question: 'Comment voir l addition ?',
          category: 'billing',
          tags: ['addition'],
        }),
        item({
          id: 'faq-order',
          question: 'Comment faire une commande ?',
          category: 'Commande',
          tags: ['commande'],
        }),
        item({
          id: 'faq-subscription',
          question: 'Comment payer mon abonnement ?',
          category: 'billing',
          tags: ['abonnement'],
        }),
        item({
          id: 'faq-name',
          question: 'Comment changer mon nom',
          category: 'support',
          tags: ['nom'],
        }),
        item({
          id: 'faq-profile',
          question: 'Comment modifier les informations de mon profil ?',
          category: 'support',
          tags: ['settings'],
        }),
      ],
      'billing addition',
      4,
    );

    expect(ranked).toHaveLength(4);
    expect(ranked[0]?.id).toBe('faq-billing');
    expect(new Set(ranked.map((entry) => entry.id)).size).toBe(4);
  });
});
