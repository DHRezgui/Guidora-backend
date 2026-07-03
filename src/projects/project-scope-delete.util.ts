import { BadRequestException } from '@nestjs/common';
import { DEFAULT_FAQ_PROJECT_KEY, normalizeFaqProjectKey } from '../faq/faq-project-key.util';
import { isSdkLabProjectKey } from '../guided-tour/guided-tour-lab.util';

export function assertDeletableProjectScopeKey(rawProjectKey?: string): string {
  const projectKey = normalizeFaqProjectKey(rawProjectKey);
  if (projectKey === DEFAULT_FAQ_PROJECT_KEY) {
    throw new BadRequestException('Le projet générique ne peut pas être supprimé.');
  }
  if (isSdkLabProjectKey(projectKey)) {
    throw new BadRequestException(
      'Les projets réservés au lab SDK ne peuvent pas être supprimés via le hub.',
    );
  }
  return projectKey;
}

export function assertProjectScopeDeleteConfirmation(
  projectKey: string,
  confirmProjectKey?: string,
): void {
  const confirmed = normalizeFaqProjectKey(confirmProjectKey);
  if (confirmed !== projectKey) {
    throw new BadRequestException(
      'La confirmation ne correspond pas à la clé du projet. Saisissez la clé exacte.',
    );
  }
}
