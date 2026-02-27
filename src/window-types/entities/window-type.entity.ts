import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Window } from '../../windows/entities/window.entity';

@Entity('window_types')
export class WindowType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => Window, window => window.window_type)
  windows: Window[];
}
