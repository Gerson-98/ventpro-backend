import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('pvc_colors')
export class PVCColor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  code: string;

  @Column({ nullable: true })
  hex_color: string;

  @Column({ default: true })
  active: boolean;
}
