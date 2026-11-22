import { EtatVide } from '../components/ui';
export default function NotFound() {
  return <EtatVide icone="🧭" titre="Page introuvable" texte="Cette page n'existe pas ou a été déplacée." action={{ libelle: 'Retour au tableau de bord', vers: '/' }} />;
}
