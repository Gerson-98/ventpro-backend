import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { WindowType } from '../../window-types/entities/window-type.entity';

@Entity('windows')
export class Window {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, order => order.windows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => WindowType, type => type.windows, { eager: true })
  @JoinColumn({ name: 'window_type_id' })
  window_type: WindowType;

  @Column()
  width_cm: number;

  @Column()
  height_cm: number;

  @Column({ default: 'blanco' })
  color: string;
}
