import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Window } from '../../windows/entities/window.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Client, (client) => client.orders, { eager: true })
  client: Client;

  @OneToMany(() => Window, (window) => window.order, { cascade: true, eager: true })
  windows: Window[];

  @Column()
  project: string;

  @Column('decimal', { precision: 10, scale: 2 })
  total: number; // 👈 debe ser number

  @Column({ default: 'en proceso' })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
