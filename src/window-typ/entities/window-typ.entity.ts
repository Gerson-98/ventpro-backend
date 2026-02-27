import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('window_types')
export class WindowType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  profile_formula: string;

  @Column()
  glass_formula: string;

  @Column({ default: true })
  active: boolean;
}
