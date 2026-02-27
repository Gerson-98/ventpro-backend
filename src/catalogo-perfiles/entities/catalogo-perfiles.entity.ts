export class CatalogoPerfiles {
  id: number;
  window_type_id: number;

  perfil_marco_id: number | null;
  perfil_hoja_id: number | null;
  perfil_mosquitero_id: number | null;
  perfil_batiente_id: number | null;
  perfil_tapajamba_id: number | null;

  regla_marco: string | null;
  regla_hoja: string | null;
  regla_mosquitero: string | null;
  regla_batiente: string | null;
  regla_tapajamba: string | null;

  cant_vidrios: number | null;
}
