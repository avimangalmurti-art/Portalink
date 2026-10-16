import {useServices} from '../../contexts/ServicesContext';
import * as service from './service';
export type ReferencesService=Pick<typeof service,'referenceProjects'|'externalReferences'|'resolveReference'|'saveExternalReference'|'deleteExternalReference'|'exportBibliography'|'weekReferenceCount'>;
export function useReferences():ReferencesService{return useServices().references??service;}
